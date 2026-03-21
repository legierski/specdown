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

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { runSpec } from './runner.js';
import { resolveConfig, mergeConfigs } from './config.js';
import { parseFrontmatter, stripFrontmatter } from './parser.js';
import type { SpecConfig } from './config.js';

export interface CliOptions {
  command: string;
  targets: string[];
  format: 'pretty' | 'json';
  config: SpecConfig;
  filter: string | null;
  baseOverridden: boolean;
}

export function parseArgs(args: string[]): CliOptions {
  const command = args[0] || 'run';
  const targets: string[] = [];
  let format: 'pretty' | 'json' = 'pretty';
  let filter: string | null = null;
  let base = 'http://localhost:3000';
  let baseOverridden = false;

  let i = 1;
  while (i < args.length) {
    if (args[i] === '--format' && args[i + 1]) {
      format = args[i + 1] as 'pretty' | 'json';
      i += 2;
    } else if (args[i] === '--base' && args[i + 1]) {
      base = args[i + 1];
      baseOverridden = true;
      i += 2;
    } else if (args[i] === '--test' && args[i + 1]) {
      filter = args[i + 1];
      i += 2;
    } else if (!args[i].startsWith('-')) {
      targets.push(args[i]);
      i++;
    } else {
      i++;
    }
  }

  const config: SpecConfig = {
    http: {
      base,
      headers: {},
    },
  };

  return { command, targets, format, config, filter, baseOverridden };
}

export function findSpecFiles(target: string): string[] {
  const resolved = resolve(target);

  if (!existsSync(resolved)) {
    console.error(`Error: ${target} does not exist`);
    process.exit(1);
  }

  const stat = statSync(resolved);

  if (stat.isFile()) {
    return [resolved];
  }

  if (stat.isDirectory()) {
    const files: string[] = [];
    for (const entry of readdirSync(resolved, { recursive: true })) {
      const name = typeof entry === 'string' ? entry : entry.toString();
      if (name.endsWith('.spec.md')) {
        files.push(join(resolved, name));
      }
    }
    return files.sort();
  }

  return [];
}

// Color helpers (for terminals that support ANSI)
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

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
    console.error(`Error: no spec files specified and default directory 'docs/' does not exist.
Try: specdown run api.spec.md  or  specdown run <directory>`);
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
