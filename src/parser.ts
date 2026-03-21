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

/**
 * Parse a markdown spec file into an array of test definitions.
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
 */
export function parseMarkdownSpec(raw: string): Test[] {
  const sections = raw.split(/^## /m).slice(1);
  const tests: Test[] = [];

  for (const section of sections) {
    const lines = section.trim().split('\n');
    const name = lines[0].trim();
    const steps: Step[] = [];

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

      // Request line — supports both → and ->
      if (line.includes('**Request**')) {
        const methodMatch = line.match(/`(GET|POST|PUT|PATCH|DELETE) (.+?)`/);
        if (!methodMatch) { idx++; continue; }

        const [, method, path] = methodMatch;
        idx++;

        // Scan between Request and Response: collect optional **Headers** block and
        // optional JSON body in any order. **Headers** here merges with currentHeaders
        // so users can write headers after the request line (HTTP message order).
        let body = null;
        let bodyAnnotations: Record<string, string> = {};

        while (idx < lines.length && !lines[idx].includes('**Response**')) {
          if (lines[idx].includes('**Headers**')) {
            // **Headers** after **Request** — merge into currentHeaders for this step
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
              // Apply length annotations to request body
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
        if (idx >= lines.length) continue;

        const responseLine = lines[idx];
        const statusMatch = responseLine.match(/(\d{3})/);
        if (!statusMatch) { idx++; continue; }

        const status = parseInt(statusMatch[1]);
        idx++;

        // Look for optional **Response Headers** block, then optional response body
        let responseHeaders: Record<string, string> = {};
        let response = null;
        let responseAnnotations: Record<string, string> = {};

        // Scan forward: skip blank lines / prose until we hit something recognizable
        while (
          idx < lines.length &&
          !lines[idx].includes('```json') &&
          !lines[idx].includes('**Request**') &&
          !lines[idx].includes('**Headers**') &&
          !lines[idx].includes('**Response Headers**')
        ) {
          idx++;
        }

        // Optional response headers block
        if (idx < lines.length && lines[idx].includes('**Response Headers**')) {
          idx++;
          // skip to the opening ```http (or ```)
          while (idx < lines.length && !lines[idx].startsWith('```')) idx++;
          if (idx < lines.length) {
            const result = extractHeadersBlock(lines, idx);
            responseHeaders = result.headers;
            idx = result.endIdx;
          }
          // Now scan for response body
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

        // Reset headers after use
        currentHeaders = {};
        continue;
      }

      idx++;
    }

    if (steps.length > 0) {
      tests.push({ name, steps });
    }
  }

  return tests;
}
