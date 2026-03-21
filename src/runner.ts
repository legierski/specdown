/**
 * Spec runner for specdown.
 *
 * Takes a parsed markdown spec and a config, executes HTTP requests,
 * and validates responses against expected values.
 */

import { parseMarkdownSpec, type Step } from './parser.js';
import { matchResponse, substituteVars } from './matcher.js';
import { matchesPattern } from './pattern.js';
import { analyzeVarChain } from './analyze.js';
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
 * Execute a single step: build headers, fetch, assert status/headers/body.
 * Mutates `vars` in-place when save-as annotations succeed.
 * Returns errors and, on failure, a FailedStepContext for output.
 */
async function executeStep(
  step: Step,
  config: SpecConfig,
  vars: Record<string, string>,
  stepIndex: number,
  stepCount: number,
): Promise<{ errors: string[]; failedStep?: FailedStepContext }> {
  const errors: string[] = [];

  // Build request headers: config defaults + step overrides
  const headers: Record<string, string> = { ...config.http.headers };
  for (const [key, value] of Object.entries(step.headers)) {
    if (value === '') {
      delete headers[key];
    } else {
      headers[key] = value;
    }
  }

  // Substitute variables in path and body
  const path = substituteVars(step.path, vars);
  const makeFailedStep = (status: number, body: any = null): FailedStepContext =>
    ({ stepIndex, stepCount, method: step.method, path, status, actualBody: body });

  // Use !== null (not if(step.body)) so falsey JSON values like false, 0, "" are included.
  // null is the sentinel for "no body block in spec".
  let bodyStr: string | undefined;
  if (step.body !== null && step.body !== undefined) {
    bodyStr = substituteVars(JSON.stringify(step.body), vars);
  }
  if (bodyStr && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }

  // AbortController covers BOTH fetch() and res.json() — timer stays armed
  // through body parsing so slow body delivery is also caught by the timeout.
  const url = `${config.http.base}${path}`;
  const timeout = config.http.timeout;
  let abortTimer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  if (timeout !== undefined && timeout > 0) {
    abortTimer = setTimeout(() => controller.abort(), timeout);
  }

  try {
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
      return { errors, failedStep: makeFailedStep(0) };
    }

    // Assert status code
    if (res.status !== step.status) {
      errors.push(`Expected status ${step.status}, got ${res.status}`);
      return { errors, failedStep: makeFailedStep(res.status) };
    }

    // Assert response headers (if any declared in spec)
    if (step.responseHeaders && Object.keys(step.responseHeaders).length > 0) {
      // Accumulate duplicate headers (e.g. Set-Cookie) so first value is not overwritten.
      const actualHeaders: Record<string, string[]> = {};
      res.headers.forEach((value, name) => {
        const key = name.toLowerCase();
        actualHeaders[key] = actualHeaders[key] ? [...actualHeaders[key], value] : [value];
      });
      for (const [assertedName, assertedValue] of Object.entries(step.responseHeaders)) {
        const actuals = actualHeaders[assertedName.toLowerCase()];
        if (actuals === undefined) {
          errors.push(`Response header missing: ${assertedName}`);
          break;
        }
        if (!actuals.some(v => matchesPattern(assertedValue, v))) {
          errors.push(
            `Response header mismatch: ${assertedName}\n  expected: ${assertedValue}\n  actual:   ${actuals.join(', ')}`
          );
          break;
        }
      }
      if (errors.length > 0) return { errors, failedStep: makeFailedStep(res.status) };
    }

    // Assert response body (if declared in spec)
    // Use !== null so falsey JSON values like false, 0, "" are checked.
    // null is the sentinel for "no expected body in spec".
    if (step.response !== null && step.response !== undefined) {
      let actual: any;
      try {
        actual = await res.json();
      } catch (err: any) {
        if (controller.signal.aborted) {
          errors.push(`Request timed out after ${timeout}ms (${step.method} ${path})`);
        } else {
          errors.push('Expected JSON response body but could not parse');
        }
        return { errors, failedStep: makeFailedStep(res.status) };
      }
      const matchErrors = matchResponse(actual, step.response, step.responseAnnotations, vars);
      if (matchErrors.length > 0) {
        errors.push(...matchErrors);
        return { errors, failedStep: makeFailedStep(res.status, actual) };
      }
    }
  } catch (err: any) {
    if (controller.signal.aborted) {
      errors.push(`Request timed out after ${timeout}ms (${step.method} ${path})`);
    } else {
      errors.push(`Request failed: ${err.message}`);
    }
    return { errors, failedStep: makeFailedStep(0) };
  } finally {
    if (abortTimer !== undefined) clearTimeout(abortTimer);
  }

  return { errors };
}

/**
 * Run all tests from a markdown spec string against a live server.
 *
 * @param filter - Optional case-insensitive substring filter on test names.
 *                 null or undefined = run all tests.
 */
export async function runSpec(markdown: string, config: SpecConfig, filter?: string | null): Promise<SpecResult> {
  const { tests, warnings: parseWarnings } = parseMarkdownSpec(markdown);
  const chainWarnings = analyzeVarChain(tests);
  const results: TestResult[] = [];
  const specStart = Date.now();
  let skipped = 0;

  for (const test of tests) {
    if (filter != null && !test.name.toLowerCase().includes(filter.toLowerCase())) {
      skipped++;
      continue;
    }
    const testStart = Date.now();
    const vars: Record<string, string> = {};
    let errors: string[] = [];
    let failedStep: FailedStepContext | undefined;

    for (let stepIndex = 0; stepIndex < test.steps.length; stepIndex++) {
      const result = await executeStep(test.steps[stepIndex], config, vars, stepIndex, test.steps.length);
      if (result.errors.length > 0) {
        errors = result.errors;
        failedStep = result.failedStep;
        break; // Stop chain on first failure
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
    warnings: [...parseWarnings, ...chainWarnings],
  };
}
