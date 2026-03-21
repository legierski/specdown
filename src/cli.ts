#!/usr/bin/env node

/**
 * specdown CLI — run .spec.md files as tests.
 *
 * Usage:
 *   specdown run [file|dir]     Run spec files
 *   specdown check [file|dir]   Validate spec files without HTTP
 *   specdown run                Run all specs in docs/
 *   specdown run file.spec.md   Run a single spec file
 *   specdown run --format json  Output results as JSON
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { runSpec } from './runner.js';
import { checkSpec } from './check.js';
import { resolveConfig, mergeConfigs } from './config.js';
import { parseFrontmatter, stripFrontmatter } from './frontmatter.js';
import { parseArgs } from './args.js';
import { findSpecFiles } from './files.js';
import { green, red, printPrettyResult, printSummary, printJsonResults, printCheckResult } from './format.js';
import type { SpecResult } from './runner.js';

export { parseArgs } from './args.js';
export { findSpecFiles } from './files.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help') {
    console.log(`specdown — API documentation that tests itself.

Usage:
  specdown run [file|dir]        Run spec files (default: docs/)
  specdown check [file|dir]      Validate specs without HTTP (default: docs/)
  specdown run --format json     Output results as JSON
  specdown run --base URL        Set base URL (default: http://localhost:3000)

Examples:
  specdown run                   Run all .spec.md in docs/
  specdown check api.spec.md     Validate a spec file
  specdown run docs/ --base http://localhost:8080
`);
    process.exit(0);
  }

  const opts = parseArgs(args);

  if (opts.command !== 'run' && opts.command !== 'check') {
    console.error(`Unknown command: ${opts.command}`);
    process.exit(1);
  }

  const usingDefault = opts.targets.length === 0;
  const targets = usingDefault ? ['docs'] : opts.targets;

  if (usingDefault && !existsSync(resolve('docs'))) {
    console.error(`Error: no spec files specified and default directory 'docs/' does not exist.\nTry: specdown run api.spec.md  or  specdown run <directory>`);
    process.exit(1);
  }

  const allFiles: string[] = [];
  for (const t of targets) {
    allFiles.push(...findSpecFiles(t));
  }

  if (allFiles.length === 0) {
    console.error('No .spec.md files found.');
    process.exit(1);
  }

  // ── check command ──
  if (opts.command === 'check') {
    let allOk = true;
    let totalTests = 0;

    for (const file of allFiles) {
      const markdown = readFileSync(file, 'utf-8');
      let fileConfig = resolveConfig(dirname(file));
      const fm = parseFrontmatter(markdown);
      if (fm?.http) fileConfig = mergeConfigs(fileConfig, fm);
      if (opts.baseOverridden) {
        fileConfig = mergeConfigs(fileConfig, { http: { base: opts.config.http.base, headers: {} } });
      }

      const result = checkSpec(stripFrontmatter(markdown), fileConfig);
      const ok = printCheckResult(file, result);
      if (!ok) allOk = false;
      totalTests += result.tests.length;
    }

    const fileWord = allFiles.length === 1 ? 'file' : 'files';
    const testWord = totalTests === 1 ? 'test' : 'tests';
    if (allOk) {
      console.log(`\n${green(`${totalTests} ${testWord}`)} in ${allFiles.length} ${fileWord}.`);
    } else {
      console.log(`\n${totalTests} ${testWord} in ${allFiles.length} ${fileWord}. ${red('Warnings found.')}`);
    }
    process.exit(allOk ? 0 : 1);
  }

  // ── run command ──
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  const jsonResults: Array<{ file: string } & SpecResult> = [];

  for (const file of allFiles) {
    const markdown = readFileSync(file, 'utf-8');

    let fileConfig = resolveConfig(dirname(file));
    const fm = parseFrontmatter(markdown);
    if (fm?.http) {
      fileConfig = mergeConfigs(fileConfig, fm);
    }
    if (opts.baseOverridden) {
      fileConfig = mergeConfigs(fileConfig, { http: { base: opts.config.http.base, headers: {} } });
    }

    const result = await runSpec(stripFrontmatter(markdown), fileConfig, opts.filter);

    totalPassed += result.passed;
    totalFailed += result.failed;
    totalSkipped += result.skipped;

    if (opts.format === 'json') {
      jsonResults.push({ file, ...result });
    } else {
      printPrettyResult(file, result, opts.verbose);
    }
  }

  if (opts.filter !== null && totalPassed === 0 && totalFailed === 0) {
    console.error(`No tests matched filter: "${opts.filter}"`);
    process.exit(1);
  }

  if (opts.format === 'json') {
    printJsonResults(jsonResults, totalPassed, totalFailed, totalSkipped);
  } else {
    printSummary(totalPassed, totalFailed, totalSkipped, allFiles.length);
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}

const isMainModule = process.argv[1]?.endsWith('/specdown') ||
  process.argv[1]?.endsWith('/cli.js') ||
  process.argv[1]?.endsWith('/cli.ts');

if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
