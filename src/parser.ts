/**
 * Markdown spec parser for specdown.
 *
 * Parses .spec.md files into structured test definitions.
 * Each ## heading = one test case, may contain multiple chained request/response steps.
 */

import { parseJsonWithAnnotations } from './json.js';

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
