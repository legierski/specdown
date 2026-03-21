/**
 * Markdown spec parser for specdown.
 *
 * Parses .spec.md files into structured test definitions.
 * Each ## heading = one test case, may contain multiple chained request/response steps.
 */

import type { SpecConfig } from './config.js';
import { extractJsonBlock, extractHeadersBlock } from './extract.js';

export type { SpecConfig };

export interface Step {
  headers: Record<string, string>;
  method: string;
  path: string;
  body: any;
  bodyAnnotations: Record<string, string>;
  status: number;
  responseHeaders: Record<string, string>;
  response: any;
  responseAnnotations: Record<string, string>;
}

export interface Test {
  name: string;
  steps: Step[];
}

export interface ParseResult {
  tests: Test[];
  /** Human-readable warnings about sections or steps that were silently skipped. */
  warnings: string[];
}

/**
 * Parse a markdown spec file into tests and parse warnings.
 *
 * Format:
 *   # Title (ignored)
 *   ## Test Name           → each ## becomes a test
 *   **Request** → `METHOD /path`
 *   ```json
 *   { request body }
 *   ```
 *   **Response** → `🟢 200 OK`
 *   ```json
 *   { expected response }
 *   ```
 *
 * Returns { tests, warnings } where warnings describes any ## sections or
 * Request/Response pairs that were skipped due to missing or invalid syntax.
 */
export function parseMarkdownSpec(raw: string): ParseResult {
  const sections = raw.split(/^## /m).slice(1);
  const tests: Test[] = [];
  const warnings: string[] = [];

  if (sections.length === 0) {
    if (raw.trim().length > 0) {
      warnings.push('No ## headings found — no tests generated (add ## Test Name sections)');
    }
    return { tests, warnings };
  }

  for (const section of sections) {
    const lines = section.trim().split('\n');
    const name = lines[0].trim();
    const steps: Step[] = [];
    let sectionHadRequest = false;

    let idx = 1;
    let currentHeaders: Record<string, string> = {};

    while (idx < lines.length) {
      const line = lines[idx];

      // Headers block
      if (line.includes('**Headers**')) {
        idx++;
        while (idx < lines.length && !lines[idx].startsWith('```')) idx++;
        if (idx < lines.length) {
          const result = extractHeadersBlock(lines, idx);
          currentHeaders = result.headers;
          idx = result.endIdx;
        }
        continue;
      }

      // Request line
      if (line.includes('**Request**')) {
        sectionHadRequest = true;
        const methodMatch = line.match(/`(GET|POST|PUT|PATCH|DELETE) (.+?)`/);
        if (!methodMatch) {
          warnings.push(`"${name}" — Request line has no valid HTTP method (step skipped)`);
          idx++;
          continue;
        }

        const [, method, path] = methodMatch;
        idx++;

        let body = null;
        let bodyAnnotations: Record<string, string> = {};

        while (idx < lines.length && !lines[idx].includes('**Response**')) {
          if (lines[idx].includes('**Headers**')) {
            idx++;
            while (idx < lines.length && !lines[idx].startsWith('```')) idx++;
            if (idx < lines.length) {
              const result = extractHeadersBlock(lines, idx);
              for (const [k, v] of Object.entries(result.headers)) {
                currentHeaders[k] = v;
              }
              idx = result.endIdx;
            }
          } else if (lines[idx].includes('```json')) {
            const result = extractJsonBlock(lines, idx);
            if (result) {
              body = result.data;
              bodyAnnotations = result.annotations;
              for (const [key, annotation] of Object.entries(bodyAnnotations)) {
                if (annotation.startsWith('length:')) {
                  const length = parseInt(annotation.replace('length:', '').trim());
                  body[key] = 'x'.repeat(length);
                }
              }
              idx = result.endIdx;
            }
          } else {
            idx++;
          }
        }

        // Find Response line
        while (idx < lines.length && !lines[idx].includes('**Response**')) idx++;
        if (idx >= lines.length) {
          warnings.push(`"${name}" — Request \`${method} ${path}\` has no Response line (step skipped)`);
          continue;
        }

        const responseLine = lines[idx];
        const statusMatch = responseLine.match(/(\d{3})/);
        if (!statusMatch) {
          warnings.push(`"${name}" — Response line has no HTTP status code (step skipped)`);
          idx++;
          continue;
        }

        const status = parseInt(statusMatch[1]);
        idx++;

        let responseHeaders: Record<string, string> = {};
        let response = null;
        let responseAnnotations: Record<string, string> = {};

        while (
          idx < lines.length &&
          !lines[idx].includes('```json') &&
          !lines[idx].includes('**Request**') &&
          !lines[idx].includes('**Headers**') &&
          !lines[idx].includes('**Response Headers**')
        ) {
          idx++;
        }

        if (idx < lines.length && lines[idx].includes('**Response Headers**')) {
          idx++;
          while (idx < lines.length && !lines[idx].startsWith('```')) idx++;
          if (idx < lines.length) {
            const result = extractHeadersBlock(lines, idx);
            responseHeaders = result.headers;
            idx = result.endIdx;
          }
          while (
            idx < lines.length &&
            !lines[idx].includes('```json') &&
            !lines[idx].includes('**Request**') &&
            !lines[idx].includes('**Headers**')
          ) {
            idx++;
          }
        }

        if (idx < lines.length && lines[idx].includes('```json')) {
          const result = extractJsonBlock(lines, idx);
          if (result) {
            response = result.data;
            responseAnnotations = result.annotations;
            idx = result.endIdx;
          }
        }

        steps.push({
          headers: { ...currentHeaders },
          method,
          path,
          body,
          bodyAnnotations,
          status,
          responseHeaders,
          response,
          responseAnnotations,
        });

        currentHeaders = {};
        continue;
      }

      idx++;
    }

    if (steps.length > 0) {
      tests.push({ name, steps });
    } else if (!sectionHadRequest) {
      // Section had no Request lines at all — warn about prose-only sections
      warnings.push(`"${name}" — section has no Request lines (no tests generated)`);
    }
  }

  return { tests, warnings };
}
