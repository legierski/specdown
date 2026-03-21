/**
 * Static variable chain analysis for specdown.
 *
 * Detects $var references in a test's steps that are never satisfied
 * by a `save as: $var` annotation in a prior step of the same test.
 * No HTTP requests are made — pure parse-tree analysis.
 */

import type { Test } from './parser.js';

/** Extract all $varName references from a string. Returns variable names (without $). */
function extractVarRefs(s: string): string[] {
  const matches = s.match(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g) ?? [];
  return matches.map(m => m.slice(1));
}

/** Recursively collect $var references from expected response values. */
function collectResponseRefs(obj: any, refs: Set<string>): void {
  if (obj === null || obj === undefined) return;
  if (typeof obj === 'string') {
    if (obj.startsWith('$') && /^\$[a-zA-Z_][a-zA-Z0-9_]*$/.test(obj)) {
      refs.add(obj.slice(1));
    }
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) collectResponseRefs(item, refs);
    return;
  }
  if (typeof obj === 'object') {
    for (const val of Object.values(obj)) collectResponseRefs(val, refs);
  }
}

/**
 * Analyse variable chain coherence across a test's steps.
 *
 * For each step, collects all $var references (path, body, expected response,
 * `not:` annotations) and checks that each was saved by a prior step's
 * `save as: $var` annotation. Saves are committed at the END of each step —
 * forward references (step N uses $x, step N+1 saves $x) are flagged.
 *
 * Returns human-readable warning strings in the same format as parser warnings.
 */
export function analyzeVarChain(tests: Test[]): string[] {
  const warnings: string[] = [];

  for (const test of tests) {
    const defined = new Set<string>();

    for (let i = 0; i < test.steps.length; i++) {
      const step = test.steps[i];
      const stepNum = i + 1;
      const refs = new Set<string>();

      // 1. Path — any $var pattern (substituteVars scans the full string)
      for (const name of extractVarRefs(step.path)) refs.add(name);

      // 2. Body — JSON stringified (substituteVars scans the full string)
      if (step.body !== null && step.body !== undefined) {
        for (const name of extractVarRefs(JSON.stringify(step.body))) refs.add(name);
      }

      // 3. Expected response values — string values starting with $ at any depth
      if (step.response !== null && step.response !== undefined) {
        collectResponseRefs(step.response, refs);
      }

      // 4. responseAnnotations with "not: $var"
      for (const annotation of Object.values(step.responseAnnotations)) {
        const notMatch = annotation?.match(/^not:\s+\$([a-zA-Z_][a-zA-Z0-9_]*)$/);
        if (notMatch) refs.add(notMatch[1]);
      }

      // Check each reference against the set of defined variables
      for (const name of refs) {
        if (!defined.has(name)) {
          warnings.push(`"${test.name}" — step ${stepNum}: $${name} is referenced but never saved`);
        }
      }

      // Commit saves AFTER checking — forward references are flagged
      for (const annotation of Object.values(step.responseAnnotations)) {
        const saveMatch = annotation?.match(/^save as:\s*\$([a-zA-Z_][a-zA-Z0-9_]*)$/);
        if (saveMatch) defined.add(saveMatch[1]);
      }
    }
  }

  return warnings;
}
