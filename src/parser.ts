/**
 * Markdown spec parser for specdown.
 *
 * Parses .spec.md files into structured test definitions.
 * Each ## heading = one test case, may contain multiple chained request/response steps.
 */

import type { SpecConfig } from './config.js';
import { extractJsonBlock, extractHeadersBlock } from './extract.js';

export type { SpecConfig };

export interface HttpStep {
  mode: 'http';
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

export interface CliStep {
  mode: 'cli';
  command: string;
  expectedExit: number | null;
  expectedOutput: any;
  outputAnnotations: Record<string, string>;
}

export interface SqlStep {
  mode: 'sql';
  query: string;
  expectedRows: number | null;
  expectedType: 'rows' | 'affected' | null;
  expectedResult: any;
  resultAnnotations: Record<string, string>;
}

export type Step = HttpStep | CliStep | SqlStep;

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

      // Query line (SQL mode)
      if (line.includes('**Query**')) {
        sectionHadRequest = true;

        // Extract query: inline (`**Query** → `SQL``) or code block
        let query: string | null = null;
        const inlineMatch = line.match(/`(.+?)`/);
        if (inlineMatch) {
          query = inlineMatch[1];
          idx++;
        } else {
          idx++;
          while (idx < lines.length && !lines[idx].startsWith('```')) idx++;
          if (idx < lines.length) {
            idx++; // skip opening ```sql or ```
            const queryLines: string[] = [];
            while (idx < lines.length && !lines[idx].startsWith('```')) {
              queryLines.push(lines[idx]);
              idx++;
            }
            if (idx < lines.length) idx++; // skip closing ```
            query = queryLines.join('\n');
          }
        }

        if (!query) {
          warnings.push(`"${name}" — Query line has no SQL (step skipped)`);
          continue;
        }

        // Find Result line
        while (idx < lines.length && !lines[idx].includes('**Result**')) idx++;

        let expectedRows: number | null = null;
        let expectedType: 'rows' | 'affected' | null = null;
        let expectedResult: any = null;
        let resultAnnotations: Record<string, string> = {};

        if (idx < lines.length) {
          const resultLine = lines[idx];
          const rowMatch = resultLine.match(/(\d+)\s+rows?/);
          const affectedMatch = resultLine.match(/(\d+)\s+affected/);
          if (rowMatch) {
            expectedRows = parseInt(rowMatch[1]);
            expectedType = 'rows';
          } else if (affectedMatch) {
            expectedRows = parseInt(affectedMatch[1]);
            expectedType = 'affected';
          }
          idx++;

          // Look for result block (JSON)
          while (idx < lines.length && lines[idx].trim() === '') idx++;
          if (idx < lines.length && lines[idx].startsWith('```')) {
            const isJson = lines[idx].includes('json');
            if (isJson) {
              const result = extractJsonBlock(lines, idx);
              if (result) {
                expectedResult = result.data;
                resultAnnotations = result.annotations;
                idx = result.endIdx;
              }
            }
          }
        }

        steps.push({
          mode: 'sql',
          query,
          expectedRows,
          expectedType,
          expectedResult,
          resultAnnotations,
        });

        continue;
      }

      // Run line (CLI mode)
      if (line.includes('**Run**')) {
        sectionHadRequest = true; // reuse flag — Run is a valid step initiator

        // Extract command: inline (`**Run** → `cmd``) or code block
        let command: string | null = null;
        const inlineMatch = line.match(/`(.+?)`/);
        if (inlineMatch) {
          command = inlineMatch[1];
          idx++;
        } else {
          // Code block follows: skip to next ``` opener
          idx++;
          while (idx < lines.length && !lines[idx].startsWith('```')) idx++;
          if (idx < lines.length) {
            idx++; // skip opening ```bash or ```
            const cmdLines: string[] = [];
            while (idx < lines.length && !lines[idx].startsWith('```')) {
              cmdLines.push(lines[idx]);
              idx++;
            }
            if (idx < lines.length) idx++; // skip closing ```
            command = cmdLines.join('\n');
          }
        }

        if (!command) {
          warnings.push(`"${name}" — Run line has no command (step skipped)`);
          continue;
        }

        // Find Output line
        while (idx < lines.length && !lines[idx].includes('**Output**')) idx++;

        let expectedExit: number | null = null;
        let expectedOutput: any = null;
        let outputAnnotations: Record<string, string> = {};

        if (idx < lines.length) {
          const outputLine = lines[idx];
          const exitMatch = outputLine.match(/exit\s+(\d+)/);
          if (exitMatch) {
            expectedExit = parseInt(exitMatch[1]);
          }
          idx++;

          // Look for output block (plain text or JSON)
          while (idx < lines.length && lines[idx].trim() === '') idx++;
          if (idx < lines.length && lines[idx].startsWith('```')) {
            const isJson = lines[idx].includes('json');
            if (isJson) {
              const result = extractJsonBlock(lines, idx);
              if (result) {
                expectedOutput = result.data;
                outputAnnotations = result.annotations;
                idx = result.endIdx;
              }
            } else {
              // Plain text block
              idx++; // skip opening ```
              const textLines: string[] = [];
              while (idx < lines.length && !lines[idx].startsWith('```')) {
                textLines.push(lines[idx]);
                idx++;
              }
              if (idx < lines.length) idx++; // skip closing ```
              expectedOutput = textLines.join('\n');
            }
          }
        }

        steps.push({
          mode: 'cli',
          command,
          expectedExit,
          expectedOutput,
          outputAnnotations,
        });

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
          mode: 'http',
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
      // Section had no Request or Run lines at all — warn about prose-only sections
      warnings.push(`"${name}" — section has no Request, Run, or Query lines (no tests generated)`);
    }
  }

  return { tests, warnings };
}
