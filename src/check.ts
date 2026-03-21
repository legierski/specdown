/**
 * Dry-run parse validation for specdown.
 *
 * checkSpec() parses a spec file without making HTTP requests.
 * Returns test names, step counts, and any parse warnings.
 */

import { parseMarkdownSpec } from './parser.js';
import { analyzeVarChain } from './analyze.js';
import type { SpecConfig } from './config.js';

export interface CheckTestSummary {
  name: string;
  stepCount: number;
}

export interface CheckResult {
  /** Tests found in the spec (name + step count only — no HTTP). */
  tests: CheckTestSummary[];
  /** Parse warnings: sections or steps silently skipped during parsing. */
  warnings: string[];
  /** The resolved config that would be used by `run`. */
  config: SpecConfig;
}

/**
 * Parse and validate a spec file without making HTTP requests.
 */
export function checkSpec(markdown: string, config: SpecConfig): CheckResult {
  const { tests, warnings } = parseMarkdownSpec(markdown);
  const chainWarnings = analyzeVarChain(tests);

  return {
    tests: tests.map(t => ({ name: t.name, stepCount: t.steps.length })),
    warnings: [...warnings, ...chainWarnings],
    config,
  };
}
