#!/usr/bin/env node

/**
 * specdown CLI — run .spec.md files as tests.
 *
 * Usage:
 *   specdown run [file|dir]     Run spec files
 *   specdown run                Run all specs in docs/
 *   specdown run file.spec.md   Run a single spec file
 *   specdown run --format json  Output results as JSON
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { runSpec } from './runner.js';
import { resolveConfig, mergeConfigs } from './config.js';
import { parseFrontmatter, stripFrontmatter } from './frontmatter.js';
import { parseArgs } from './args.js';
import { findSpecFiles } from './files.js';
import { green, red, dim, bold } from './format.js';

export { parseArgs } from './args.js';
export { findSpecFiles } from './files.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help') {
    console.log(`specdown — API documentation that tests itself.

Usage:
  specdown run [file|dir]        Run spec files (default: docs/)
  specdown run --format json     Output results as JSON
  specdown run --base URL        Set base URL (default: http://localhost:3000)

Examples:
  specdown run                   Run all .spec.md in docs/
  specdown run api.spec.md       Run a single spec
  specdown run docs/ --base http://localhost:8080
`);
    process.exit(0);
  }

  const opts = parseArgs(args);

  if (opts.command !== 'run') {
    console.error(`Unknown command: ${opts.command}`);
    process.exit(1);
  }

  // Default to docs/ if no targets
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

  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  const jsonResults: any[] = [];

  for (const file of allFiles) {
    const markdown = readFileSync(file, 'utf-8');

    // Resolve config cascade: .specdown files → frontmatter → --base CLI flag
    let fileConfig = resolveConfig(dirname(file));
    // Apply frontmatter (higher priority than .specdown, lower than --base)
    const fm = parseFrontmatter(markdown);
    if (fm?.http) {
      fileConfig = mergeConfigs(fileConfig, fm);
    }
    // CLI --base flag overrides everything (use boolean flag, not value comparison)
    if (opts.baseOverridden) {
      fileConfig = mergeConfigs(fileConfig, { http: { base: opts.config.http.base, headers: {} } });
    }

    const result = await runSpec(stripFrontmatter(markdown), fileConfig, opts.filter);

    totalPassed += result.passed;
    totalFailed += result.failed;
    totalSkipped += result.skipped;

    if (opts.format === 'json') {
      jsonResults.push({
        file,
        ...result,
      });
    } else if (result.tests.length > 0) {
      // Pretty output — skip files with zero matching tests when filtering
      const relPath = file.replace(process.cwd() + '/', '');
      console.log(`\n${bold(relPath)}`);
      for (const test of result.tests) {
        if (test.passed) {
          console.log(`  ${green('✓')} ${test.name} ${dim(`(${test.duration}ms)`)}`);
        } else {
          console.log(`  ${red('✗')} ${test.name} ${dim(`(${test.duration}ms)`)}`);
          for (const err of test.errors) {
            console.log(`    ${red(err)}`);
          }
        }
      }
    }
  }

  // Zero-match check: if a filter was given but nothing ran, that's an error
  if (opts.filter !== null && totalPassed === 0 && totalFailed === 0) {
    console.error(`No tests matched filter: "${opts.filter}"`);
    process.exit(1);
  }

  if (opts.format === 'json') {
    console.log(JSON.stringify({
      files: jsonResults,
      passed: totalPassed,
      failed: totalFailed,
      skipped: totalSkipped,
    }, null, 2));
  } else {
    const skippedStr = totalSkipped > 0 ? `, ${dim(`${totalSkipped} skipped`)}` : '';
    console.log(`\n${bold('Results:')} ${green(`${totalPassed} passed`)}, ${totalFailed > 0 ? red(`${totalFailed} failed`) : `${totalFailed} failed`}${skippedStr} ${dim(`(${allFiles.length} file${allFiles.length === 1 ? '' : 's'})`)}`);
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}

// Only run when executed directly (not when imported for testing)
const isMainModule = process.argv[1]?.endsWith('/specdown') ||
  process.argv[1]?.endsWith('/cli.js') ||
  process.argv[1]?.endsWith('/cli.ts');

if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
