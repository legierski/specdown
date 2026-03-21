/**
 * Test filter tests — `--test "substring"` CLI flag.
 *
 * Design:
 *   - Case-insensitive substring match against test names
 *   - null filter = run all (no filtering)
 *   - runSpec(markdown, config, filter?) — filter is optional 3rd param
 *   - SpecResult gains `skipped: number` field
 *   - Skipped tests not included in `tests` array
 *   - Zero matches across all files → CLI exits 1 with error message
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { runSpec } from '../src/runner.js';
import type { SpecConfig } from '../src/config.js';

// ──────────────────────────────────────
// Unit: matchesFilter (imported via runner or standalone)
// ──────────────────────────────────────

// We test filter behaviour through runSpec rather than a separate exported
// function, keeping the public API surface minimal.

// ──────────────────────────────────────
// Integration: runSpec with filter
// ──────────────────────────────────────

let server: Server;
let port: number;

const SPEC = `
# API

## Health check

**Request** → \`GET /health\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{"status": "ok"}
\`\`\`

## Create user

**Request** → \`GET /health\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{"status": "ok"}
\`\`\`

## Delete user

**Request** → \`GET /health\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{"status": "ok"}
\`\`\`
`;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"status": "ok"}');
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      port = (server.address() as any).port;
      resolve();
    });
  });
});

afterAll(() => {
  server.close();
});

function config(): SpecConfig {
  return { http: { base: `http://localhost:${port}`, headers: {} } };
}

describe('runSpec filter', () => {
  it('null filter runs all tests', async () => {
    const result = await runSpec(SPEC, config(), null);
    expect(result.passed).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.tests).toHaveLength(3);
  });

  it('undefined filter (no arg) runs all tests', async () => {
    const result = await runSpec(SPEC, config());
    expect(result.passed).toBe(3);
    expect(result.skipped).toBe(0);
  });

  it('exact match runs one test', async () => {
    const result = await runSpec(SPEC, config(), 'Health check');
    expect(result.passed).toBe(1);
    expect(result.skipped).toBe(2);
    expect(result.tests).toHaveLength(1);
    expect(result.tests[0].name).toBe('Health check');
  });

  it('case-insensitive substring match', async () => {
    const result = await runSpec(SPEC, config(), 'health');
    expect(result.passed).toBe(1);
    expect(result.skipped).toBe(2);
    expect(result.tests[0].name).toBe('Health check');
  });

  it('substring matches multiple tests', async () => {
    const result = await runSpec(SPEC, config(), 'user');
    expect(result.passed).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.tests).toHaveLength(2);
    expect(result.tests.map(t => t.name)).toEqual(['Create user', 'Delete user']);
  });

  it('filter matching zero tests returns skipped=3, passed=0', async () => {
    const result = await runSpec(SPEC, config(), 'nonexistent');
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(3);
    expect(result.tests).toHaveLength(0);
  });

  it('skipped tests not in tests array', async () => {
    const result = await runSpec(SPEC, config(), 'create');
    expect(result.tests).toHaveLength(1);
    expect(result.tests[0].name).toBe('Create user');
    // "Health check" and "Delete user" were skipped — not present
    expect(result.tests.find(t => t.name === 'Health check')).toBeUndefined();
    expect(result.tests.find(t => t.name === 'Delete user')).toBeUndefined();
  });

  it('failed tests within filter still counted as failed', async () => {
    // Spec with one failing test that matches the filter
    const spec = `
# API

## Health check

**Request** → \`GET /health\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{"status": "ok"}
\`\`\`

## Broken endpoint

**Request** → \`GET /health\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{"status": "broken"}
\`\`\`
`;
    const result = await runSpec(spec, config(), 'broken');
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.skipped).toBe(1);
  });
});

// ──────────────────────────────────────
// parseArgs: --test flag parsing
// ──────────────────────────────────────

import { parseArgs } from '../src/args.js';

describe('parseArgs --test', () => {
  it('no --test flag → filter is null', () => {
    const opts = parseArgs(['run', 'api.spec.md']);
    expect(opts.filter).toBeNull();
  });

  it('--test sets filter string', () => {
    const opts = parseArgs(['run', 'api.spec.md', '--test', 'Create a user']);
    expect(opts.filter).toBe('Create a user');
  });

  it('--test combined with --base and --format', () => {
    const opts = parseArgs(['run', 'api.spec.md', '--base', 'http://localhost:9000', '--format', 'json', '--test', 'health']);
    expect(opts.filter).toBe('health');
    expect(opts.config.http.base).toBe('http://localhost:9000');
    expect(opts.format).toBe('json');
  });
});
