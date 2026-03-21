/**
 * Markdown spec parser for specdown.
 *
 * Parses .spec.md files into structured test definitions.
 * Each ## heading = one test case, may contain multiple chained request/response steps.
 */

import { parseJsonWithAnnotations } from './json.js';
import type { SpecConfig } from './config.js';

export interface Step {
  headers: Record<string, string>;
  method: string;
  path: string;
  body: any;
  bodyAnnotations: Record<string, string>;
  status: number;
  response: any;
  responseAnnotations: Record<string, string>;
}

export interface Test {
  name: string;
  steps: Step[];
}

/**
 * Extract a JSON code block starting at lines[startIdx] (the ```json line).
 */
function extractJsonBlock(
  lines: string[],
  startIdx: number
): { data: any; annotations: Record<string, string>; endIdx: number } | null {
  if (startIdx >= lines.length || !lines[startIdx].includes('```json')) return null;

  let idx = startIdx + 1;
  const blockLines: string[] = [];
  while (idx < lines.length && !lines[idx].includes('```')) {
    blockLines.push(lines[idx]);
    idx++;
  }
  idx++; // skip closing ```

  if (blockLines.length === 0) return { data: null, annotations: {}, endIdx: idx };

  const { data, annotations } = parseJsonWithAnnotations(blockLines.join('\n'));
  return { data, annotations, endIdx: idx };
}

/**
 * Extract a headers code block starting at lines[startIdx].
 */
function extractHeadersBlock(
  lines: string[],
  startIdx: number
): { headers: Record<string, string>; endIdx: number } {
  const headers: Record<string, string> = {};
  let idx = startIdx + 1;
  while (idx < lines.length && !lines[idx].startsWith('```')) {
    const line = lines[idx].trim();
    if (line.includes(':')) {
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();
      headers[key.trim()] = value;
    }
    idx++;
  }
  idx++; // skip closing ```
  return { headers, endIdx: idx };
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

        // Look for request body (optional)
        let body = null;
        let bodyAnnotations: Record<string, string> = {};
        while (
          idx < lines.length &&
          !lines[idx].includes('```json') &&
          !lines[idx].includes('**Response**')
        ) {
          idx++;
        }

        if (idx < lines.length && lines[idx].includes('```json')) {
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
        }

        // Find Response line
        while (idx < lines.length && !lines[idx].includes('**Response**')) idx++;
        if (idx >= lines.length) continue;

        const responseLine = lines[idx];
        const statusMatch = responseLine.match(/(\d{3})/);
        if (!statusMatch) { idx++; continue; }

        const status = parseInt(statusMatch[1]);
        idx++;

        // Look for response body (optional)
        let response = null;
        let responseAnnotations: Record<string, string> = {};
        while (
          idx < lines.length &&
          !lines[idx].includes('```json') &&
          !lines[idx].includes('**Request**') &&
          !lines[idx].includes('**Headers**')
        ) {
          idx++;
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

/**
 * Parse a YAML frontmatter block at the top of a markdown file.
 * Supports: base, timeout, headers (with indented key: value pairs).
 * Returns null if no frontmatter, empty frontmatter, or no recognized fields.
 */
export function parseFrontmatter(markdown: string): Partial<SpecConfig> | null {
  const lines = markdown.split('\n');
  if (lines[0] !== '---') return null;

  // Find closing ---
  let endLine = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      endLine = i;
      break;
    }
  }
  if (endLine === -1) return null;

  const fmLines = lines.slice(1, endLine);
  if (fmLines.every(l => !l.trim())) return null;

  let base: string | undefined;
  let timeout: number | undefined;
  let headers: Record<string, string> | undefined;

  let i = 0;
  while (i < fmLines.length) {
    const line = fmLines[i];
    if (!line.trim()) { i++; continue; }

    if (line.startsWith('base:')) {
      base = line.slice('base:'.length).trim();
      i++;
    } else if (line.startsWith('timeout:')) {
      // parseInt intentionally truncates floats (99.5 → 99); this is fine for ms values
      const val = parseInt(line.slice('timeout:'.length).trim(), 10);
      if (!isNaN(val)) timeout = val;
      i++;
    } else if (line.startsWith('headers:')) {
      headers = {};
      i++;
      // Consume indented lines
      while (i < fmLines.length && (fmLines[i].startsWith('  ') || fmLines[i].startsWith('\t'))) {
        const headerLine = fmLines[i].trim();
        const colonIdx = headerLine.indexOf(':');
        if (colonIdx !== -1) {
          const key = headerLine.slice(0, colonIdx).trim();
          let value = headerLine.slice(colonIdx + 1).trim();
          // Strip surrounding quotes
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          headers[key] = value;
        }
        i++;
      }
    } else {
      // Unknown top-level key — warn so typos like "base_url" don't silently do nothing
      const key = line.split(':')[0].trim();
      if (key && !line.startsWith(' ') && !line.startsWith('\t')) {
        process.stderr.write(
          `specdown: unknown frontmatter field '${key}' (valid: base, timeout, headers)\n`
        );
      }
      i++;
    }
  }

  if (base === undefined && timeout === undefined && headers === undefined) return null;

  const http: any = {};
  if (base !== undefined) http.base = base;
  if (timeout !== undefined) http.timeout = timeout;
  if (headers !== undefined) http.headers = headers;

  return { http };
}

/**
 * Remove the YAML frontmatter block from the top of a markdown string.
 * Returns the markdown unchanged if no frontmatter is present.
 */
export function stripFrontmatter(markdown: string): string {
  const lines = markdown.split('\n');
  if (lines[0] !== '---') return markdown;

  let endLine = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      endLine = i;
      break;
    }
  }
  if (endLine === -1) return markdown;

  return lines.slice(endLine + 1).join('\n');
}
