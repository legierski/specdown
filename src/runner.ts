/**
 * Spec runner for specdown.
 *
 * Takes a parsed markdown spec and a config, executes HTTP requests,
 * and validates responses against expected values.
 */

import { parseMarkdownSpec, type Test } from './parser.js';
import { matchResponse, substituteVars } from './matcher.js';
import type { SpecConfig } from './config.js';

export interface TestResult {
  name: string;
  passed: boolean;
  errors: string[];
  duration: number;
}

export interface SpecResult {
  tests: TestResult[];
  passed: number;
  failed: number;
  duration: number;
}

/**
 * Run all tests from a markdown spec string against a live server.
 */
export async function runSpec(markdown: string, config: SpecConfig): Promise<SpecResult> {
  const tests = parseMarkdownSpec(markdown);
  const results: TestResult[] = [];
  const specStart = Date.now();

  for (const test of tests) {
    const testStart = Date.now();
    const errors: string[] = [];
    const vars: Record<string, string> = {};

    for (const step of test.steps) {
      try {
        // Build headers: config defaults + step overrides
        const headers: Record<string, string> = { ...config.http.headers };
        for (const [key, value] of Object.entries(step.headers)) {
          if (value === 'none' || value === '') {
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

        // Execute request
        const url = `${config.http.base}${path}`;
        const res = await fetch(url, {
          method: step.method,
          headers,
          body: bodyStr,
          redirect: 'manual',
        });

        // Check status code
        if (res.status !== step.status) {
          errors.push(`Expected status ${step.status}, got ${res.status}`);
          break; // Stop chain on status mismatch
        }

        // Check response body if expected
        if (step.response) {
          let actual: any;
          try {
            actual = await res.json();
          } catch {
            errors.push('Expected JSON response body but could not parse');
            break;
          }
          const matchErrors = matchResponse(actual, step.response, step.responseAnnotations, vars);
          if (matchErrors.length > 0) {
            errors.push(...matchErrors);
            break;
          }
        }
      } catch (err: any) {
        errors.push(`Request failed: ${err.message}`);
        break;
      }
    }

    results.push({
      name: test.name,
      passed: errors.length === 0,
      errors,
      duration: Date.now() - testStart,
    });
  }

  return {
    tests: results,
    passed: results.filter(t => t.passed).length,
    failed: results.filter(t => !t.passed).length,
    duration: Date.now() - specStart,
  };
}
