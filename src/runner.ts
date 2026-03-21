/**
 * Spec runner for specdown.
 *
 * Takes a parsed markdown spec and a config, executes HTTP requests,
 * and validates responses against expected values.
 */

import { parseMarkdownSpec, type Test } from './parser.js';
import { matchResponse, substituteVars } from './matcher.js';
import { matchesPattern } from './pattern.js';
import type { SpecConfig } from './config.js';

export interface FailedStepContext {
  /** 0-based index of the step that failed. */
  stepIndex: number;
  /** Total number of steps in the test. */
  stepCount: number;
  method: string;
  /** Request path after variable substitution. */
  path: string;
  /** Actual HTTP status code received. */
  status: number;
  /** Parsed response body, or null if body was not parsed (e.g. status mismatch). */
  actualBody: any;
}

export interface TestResult {
  name: string;
  passed: boolean;
  errors: string[];
  duration: number;
  /** Present on failing tests; absent on passing tests. */
  failedStep?: FailedStepContext;
}

export interface SpecResult {
  tests: TestResult[];
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  /** Parse warnings: sections/steps silently skipped during markdown parsing. */
  warnings: string[];
}

/**
 * Run all tests from a markdown spec string against a live server.
 *
 * @param filter - Optional case-insensitive substring filter on test names.
 *                 null or undefined = run all tests.
 */
export async function runSpec(markdown: string, config: SpecConfig, filter?: string | null): Promise<SpecResult> {
  const { tests, warnings: parseWarnings } = parseMarkdownSpec(markdown);
  const results: TestResult[] = [];
  const specStart = Date.now();
  let skipped = 0;

  for (const test of tests) {
    // Apply filter: skip tests whose name doesn't contain the filter string
    if (filter != null && !test.name.toLowerCase().includes(filter.toLowerCase())) {
      skipped++;
      continue;
    }
    const testStart = Date.now();
    const errors: string[] = [];
    const vars: Record<string, string> = {};
    let failedStep: FailedStepContext | undefined;

    for (let stepIndex = 0; stepIndex < test.steps.length; stepIndex++) {
      const step = test.steps[stepIndex];
      // Build headers: config defaults + step overrides
      const headers: Record<string, string> = { ...config.http.headers };
      for (const [key, value] of Object.entries(step.headers)) {
        if (value === '') {
          delete headers[key];
        } else {
          headers[key] = value;
        }
      }

      // Substitute variables in path
      const path = substituteVars(step.path, vars);

      // Substitute variables in request body
      let bodyStr: string | undefined;
      if (step.body) {
        bodyStr = substituteVars(JSON.stringify(step.body), vars);
      }

      // Infer Content-Type for JSON bodies if not already set
      if (bodyStr && !headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }

      // Execute request — AbortController covers BOTH fetch() and res.json().
      // Timer is NOT cleared after fetch() resolves on headers; it stays armed
      // through body parsing so slow body delivery is also covered by the timeout.
      const url = `${config.http.base}${path}`;
      const timeout = config.http.timeout;
      let abortTimer: ReturnType<typeof setTimeout> | undefined;
      const controller = new AbortController();
      if (timeout !== undefined && timeout > 0) {
        abortTimer = setTimeout(() => controller.abort(), timeout);
      }

      try {
        // Fetch — throws AbortError if aborted during network phase
        let res: Response;
        try {
          res = await fetch(url, {
            method: step.method,
            headers,
            body: bodyStr,
            redirect: 'manual',
            signal: controller.signal,
          });
        } catch (err: any) {
          if (controller.signal.aborted) {
            errors.push(`Request timed out after ${timeout}ms (${step.method} ${path})`);
          } else {
            errors.push(`Request failed: ${err.message}`);
          }
          failedStep = { stepIndex, stepCount: test.steps.length, method: step.method, path, status: 0, actualBody: null };
          break;
        }

        // Check status code
        if (res.status !== step.status) {
          errors.push(`Expected status ${step.status}, got ${res.status}`);
          failedStep = { stepIndex, stepCount: test.steps.length, method: step.method, path, status: res.status, actualBody: null };
          break; // Stop chain on status mismatch
        }

        // Check response headers if asserted
        if (step.responseHeaders && Object.keys(step.responseHeaders).length > 0) {
          // Build a lowercase-keyed map of actual response headers for case-insensitive lookup
          const actualHeaders: Record<string, string> = {};
          res.headers.forEach((value, name) => {
            actualHeaders[name.toLowerCase()] = value;
          });

          for (const [assertedName, assertedValue] of Object.entries(step.responseHeaders)) {
            const actual = actualHeaders[assertedName.toLowerCase()];
            if (actual === undefined) {
              errors.push(`Response header missing: ${assertedName}`);
              break;
            }
            if (!matchesPattern(assertedValue, actual)) {
              errors.push(
                `Response header mismatch: ${assertedName}\n  expected: ${assertedValue}\n  actual:   ${actual}`
              );
              break;
            }
          }
          if (errors.length > 0) {
            failedStep = { stepIndex, stepCount: test.steps.length, method: step.method, path, status: res.status, actualBody: null };
            break;
          }
        }

        // Check response body if expected — signal still armed, covers slow body delivery
        if (step.response) {
          let actual: any;
          try {
            actual = await res.json();
          } catch (err: any) {
            if (controller.signal.aborted) {
              errors.push(`Request timed out after ${timeout}ms (${step.method} ${path})`);
            } else {
              errors.push('Expected JSON response body but could not parse');
            }
            failedStep = { stepIndex, stepCount: test.steps.length, method: step.method, path, status: res.status, actualBody: null };
            break;
          }
          const matchErrors = matchResponse(actual, step.response, step.responseAnnotations, vars);
          if (matchErrors.length > 0) {
            errors.push(...matchErrors);
            failedStep = { stepIndex, stepCount: test.steps.length, method: step.method, path, status: res.status, actualBody: actual };
            break;
          }
        }
      } catch (err: any) {
        // Catch-all for unexpected errors not caught by inner try blocks
        if (controller.signal.aborted) {
          errors.push(`Request timed out after ${timeout}ms (${step.method} ${path})`);
        } else {
          errors.push(`Request failed: ${err.message}`);
        }
        if (!failedStep) {
          failedStep = { stepIndex, stepCount: test.steps.length, method: step.method, path, status: 0, actualBody: null };
        }
        break;
      } finally {
        // Clear timer after entire step (fetch + body parsing) completes
        if (abortTimer !== undefined) clearTimeout(abortTimer);
      }
    }

    results.push({
      name: test.name,
      passed: errors.length === 0,
      errors,
      ...(failedStep !== undefined ? { failedStep } : {}),
      duration: Date.now() - testStart,
    });
  }

  return {
    tests: results,
    passed: results.filter(t => t.passed).length,
    failed: results.filter(t => !t.passed).length,
    skipped,
    duration: Date.now() - specStart,
    warnings: parseWarnings,
  };
}
