/**
 * Terminal formatting helpers and output formatters for specdown CLI.
 */

import type { SpecResult, FailedStepContext } from './runner.js';
import type { CheckResult } from './check.js';

const BODY_INLINE_THRESHOLD = 200;

export const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
export const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
export const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
export const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

/**
 * Print pretty (human-readable) output for one spec file's results.
 * Skips files with zero tests (e.g. when filtering).
 *
 * @param verbose - If true, always show actual response body on failure (default: false).
 *                  When false, body is shown only if its JSON is ≤ BODY_INLINE_THRESHOLD chars.
 */
export function printPrettyResult(file: string, result: SpecResult, verbose = false): void {
  if (result.tests.length === 0) return;

  const relPath = file.replace(process.cwd() + '/', '');
  console.log(`\n${bold(relPath)}`);
  for (const test of result.tests) {
    if (test.passed) {
      console.log(`  ${green('✓')} ${test.name} ${dim(`(${test.duration}ms)`)}`);
    } else {
      console.log(`  ${red('✗')} ${test.name} ${dim(`(${test.duration}ms)`)}`);
      const fs = (test as any).failedStep as FailedStepContext | undefined;
      if (fs) {
        const n = fs.stepIndex + 1;
        const total = fs.stepCount;
        console.log(`    ${dim(`Step ${n}/${total}: ${fs.method} ${fs.path}`)}`);
        console.log(`    ${dim(`Response: ${fs.status}`)}`);
        if (fs.actualBody !== null) {
          const bodyJson = JSON.stringify(fs.actualBody);
          if (verbose || bodyJson.length <= BODY_INLINE_THRESHOLD) {
            console.log(`    ${dim(bodyJson)}`);
          }
        }
      }
      for (const err of test.errors) {
        console.log(`    ${red(err)}`);
      }
    }
  }
}

/**
 * Print the final summary line for pretty output.
 */
export function printSummary(
  passed: number,
  failed: number,
  skipped: number,
  fileCount: number,
): void {
  const skippedStr = skipped > 0 ? `, ${dim(`${skipped} skipped`)}` : '';
  const failedStr = failed > 0 ? red(`${failed} failed`) : `${failed} failed`;
  const filesStr = dim(`(${fileCount} file${fileCount === 1 ? '' : 's'})`);
  console.log(`\n${bold('Results:')} ${green(`${passed} passed`)}, ${failedStr}${skippedStr} ${filesStr}`);
}

/**
 * Print `specdown check` output for one spec file.
 * Returns true if the file has tests and no warnings; false otherwise.
 */
export function printCheckResult(file: string, result: CheckResult): boolean {
  const relPath = file.replace(process.cwd() + '/', '');
  const base = dim(`[${result.config.http.base}]`);

  if (result.tests.length === 0) {
    console.log(`\n${bold(relPath)} ${base}`);
    console.log(`  ${red('⚠')} No tests found`);
    for (const w of result.warnings) {
      console.log(`    ${dim(w)}`);
    }
    return false;
  }

  console.log(`\n${bold(relPath)} ${base}`);
  for (const t of result.tests) {
    const steps = t.stepCount === 1 ? '1 step' : `${t.stepCount} steps`;
    console.log(`  ${green('✓')} ${t.name} ${dim(`(${steps})`)}`);
  }
  if (result.warnings.length > 0) {
    for (const w of result.warnings) {
      console.log(`  ${red('⚠')} ${w}`);
    }
    return false;
  }
  return true;
}

/**
 * Print JSON output for all files.
 */
export function printJsonResults(
  fileResults: Array<{ file: string } & SpecResult>,
  passed: number,
  failed: number,
  skipped: number,
): void {
  console.log(JSON.stringify({ files: fileResults, passed, failed, skipped }, null, 2));
}
