import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseArgs, findSpecFiles } from '../src/cli.js';
import { runSpec } from '../src/runner.js';
import type { SpecConfig } from '../src/config.js';

// ──────────────────────────────────────
// parseArgs tests
// ──────────────────────────────────────

describe('parseArgs', () => {
  it('defaults to "run" command with no args', () => {
    const opts = parseArgs([]);
    expect(opts.command).toBe('run');
  });

  it('extracts command from first positional', () => {
    const opts = parseArgs(['run']);
    expect(opts.command).toBe('run');
    expect(opts.targets).toEqual([]);
  });

  it('extracts file targets after command', () => {
    const opts = parseArgs(['run', 'api.spec.md', 'auth.spec.md']);
    expect(opts.targets).toEqual(['api.spec.md', 'auth.spec.md']);
  });

  it('extracts directory target', () => {
    const opts = parseArgs(['run', 'docs/']);
    expect(opts.targets).toEqual(['docs/']);
  });

  it('parses --format json', () => {
    const opts = parseArgs(['run', '--format', 'json']);
    expect(opts.format).toBe('json');
  });

  it('defaults format to pretty', () => {
    const opts = parseArgs(['run', 'api.spec.md']);
    expect(opts.format).toBe('pretty');
  });

  it('parses --base URL', () => {
    const opts = parseArgs(['run', '--base', 'http://localhost:8080']);
    expect(opts.config.http.base).toBe('http://localhost:8080');
  });

  it('defaults base to http://localhost:3000', () => {
    const opts = parseArgs(['run']);
    expect(opts.config.http.base).toBe('http://localhost:3000');
  });

  it('handles --format and --base together', () => {
    const opts = parseArgs(['run', '--format', 'json', '--base', 'http://api.test:9000']);
    expect(opts.format).toBe('json');
    expect(opts.config.http.base).toBe('http://api.test:9000');
  });

  it('handles targets mixed with flags', () => {
    const opts = parseArgs(['run', 'api.spec.md', '--format', 'json', 'auth.spec.md']);
    expect(opts.targets).toEqual(['api.spec.md', 'auth.spec.md']);
    expect(opts.format).toBe('json');
  });

  it('ignores unknown flags', () => {
    const opts = parseArgs(['run', '--verbose', 'api.spec.md']);
    expect(opts.targets).toEqual(['api.spec.md']);
  });

  it('handles unknown command gracefully', () => {
    const opts = parseArgs(['validate']);
    expect(opts.command).toBe('validate');
  });

  it('sets Content-Type header by default', () => {
    const opts = parseArgs(['run']);
    expect(opts.config.http.headers['Content-Type']).toBe('application/json');
  });

  it('handles --base as last arg without value', () => {
    // --base with no following value should use default
    const opts = parseArgs(['run', '--base']);
    expect(opts.config.http.base).toBe('http://localhost:3000');
  });

  it('handles --format as last arg without value', () => {
    const opts = parseArgs(['run', '--format']);
    expect(opts.format).toBe('pretty');
  });
});

// ──────────────────────────────────────
// findSpecFiles tests
// ──────────────────────────────────────

const tmpDir = resolve(__dirname, '__cli-test-tmp__');

describe('findSpecFiles', () => {
  beforeEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
    mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
  });

  it('returns single file when given a file path', () => {
    const file = join(tmpDir, 'test.spec.md');
    writeFileSync(file, '# Test');
    const result = findSpecFiles(file);
    expect(result).toEqual([resolve(file)]);
  });

  it('finds all .spec.md files in a directory', () => {
    writeFileSync(join(tmpDir, 'a.spec.md'), '# A');
    writeFileSync(join(tmpDir, 'b.spec.md'), '# B');
    writeFileSync(join(tmpDir, 'readme.md'), '# Not a spec');
    const result = findSpecFiles(tmpDir);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('a.spec.md');
    expect(result[1]).toContain('b.spec.md');
  });

  it('finds .spec.md files recursively in subdirectories', () => {
    const sub = join(tmpDir, 'sub');
    mkdirSync(sub);
    writeFileSync(join(tmpDir, 'root.spec.md'), '# Root');
    writeFileSync(join(sub, 'nested.spec.md'), '# Nested');
    const result = findSpecFiles(tmpDir);
    expect(result).toHaveLength(2);
  });

  it('returns sorted results', () => {
    writeFileSync(join(tmpDir, 'c.spec.md'), '# C');
    writeFileSync(join(tmpDir, 'a.spec.md'), '# A');
    writeFileSync(join(tmpDir, 'b.spec.md'), '# B');
    const result = findSpecFiles(tmpDir);
    expect(result[0]).toContain('a.spec.md');
    expect(result[1]).toContain('b.spec.md');
    expect(result[2]).toContain('c.spec.md');
  });

  it('returns empty array for directory with no spec files', () => {
    writeFileSync(join(tmpDir, 'readme.md'), '# Not a spec');
    writeFileSync(join(tmpDir, 'data.json'), '{}');
    const result = findSpecFiles(tmpDir);
    expect(result).toEqual([]);
  });

  it('handles file that is not a .spec.md', () => {
    const file = join(tmpDir, 'readme.md');
    writeFileSync(file, '# Not a spec');
    const result = findSpecFiles(file);
    // findSpecFiles returns any single file, not just .spec.md
    expect(result).toHaveLength(1);
  });
});

// ──────────────────────────────────────
// JSON format output tests
// ──────────────────────────────────────

let server: Server;
let port: number;
const store: Record<string, any> = {};

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const url = new URL(req.url!, 'http://localhost');

      if (req.method === 'POST' && url.pathname === '/v1/items') {
        const data = JSON.parse(body);
        const id = 'item_abc123def456';
        store[id] = { id, name: data.name };
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(store[id]));
        return;
      }

      if (req.method === 'GET' && url.pathname.startsWith('/v1/items/')) {
        const id = url.pathname.split('/').pop()!;
        const item = store[id];
        if (item) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(item));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id, name: 'Default' }));
        }
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{"error": "not found"}');
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      port = (server.address() as any).port;
      resolve();
    });
  });
});

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
});

afterAll(() => {
  server.close();
});

function config(): SpecConfig {
  return {
    http: {
      base: `http://localhost:${port}`,
      headers: { 'Content-Type': 'application/json' },
    },
  };
}

describe('JSON output format', () => {
  it('result includes file info, passed/failed counts', async () => {
    const md = `# API

## Create item

**Request** → \`POST /v1/items\`

\`\`\`json
{"name": "JSON Output Test"}
\`\`\`

**Response** → \`🟢 201 Created\`

\`\`\`json
{
  "id": "item_xxxxxxxxxxxx",
  "name": "JSON Output Test"
}
\`\`\`
`;
    const result = await runSpec(md, config());

    // Simulate what the CLI does for JSON output
    const jsonOutput = {
      files: [{
        file: 'test.spec.md',
        ...result,
      }],
      passed: result.passed,
      failed: result.failed,
    };

    expect(jsonOutput.files).toHaveLength(1);
    expect(jsonOutput.files[0].file).toBe('test.spec.md');
    expect(jsonOutput.passed).toBe(1);
    expect(jsonOutput.failed).toBe(0);
    expect(jsonOutput.files[0].tests[0].name).toBe('Create item');
  });

  it('JSON output includes error details for failures', async () => {
    const md = `# API

## Should fail

**Request** → \`GET /v1/nonexistent\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{"ok": true}
\`\`\`
`;
    const result = await runSpec(md, config());
    const jsonOutput = {
      files: [{ file: 'fail.spec.md', ...result }],
      passed: result.passed,
      failed: result.failed,
    };

    expect(jsonOutput.failed).toBe(1);
    expect(jsonOutput.files[0].tests[0].passed).toBe(false);
    expect(jsonOutput.files[0].tests[0].errors.length).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────
// Random non-spec markdown handling
// ──────────────────────────────────────

describe('non-spec markdown files', () => {
  it('handles a blog post markdown gracefully', async () => {
    const blogPost = `# My Awesome Blog Post

Published on January 1, 2026.

## Introduction

This is a blog post about pineapple farming. It has **bold text**, *italic text*, and [links](http://example.com).

## The Main Point

Here's a list:
- Item one
- Item two
- Item three

## Conclusion

Thanks for reading!

---

*Written by AI*
`;
    const result = await runSpec(blogPost, config());
    expect(result.tests).toEqual([]);
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('handles markdown with code blocks that are not JSON', async () => {
    const techDoc = `# Setup Guide

## Install

Run the following:

\`\`\`bash
npm install specdown
\`\`\`

## Usage

\`\`\`typescript
import { runSpec } from 'specdown';
\`\`\`
`;
    const result = await runSpec(techDoc, config());
    expect(result.tests).toEqual([]);
  });

  it('handles markdown with HTTP mentions that are not spec format', async () => {
    const apiDocs = `# API Reference

## Authentication

Send a POST request to \`/auth/login\` with your credentials.

The response will include a JWT token.

## Rate Limits

GET requests are limited to 100/minute.
POST requests are limited to 20/minute.
`;
    const result = await runSpec(apiDocs, config());
    expect(result.tests).toEqual([]);
  });
});

// ──────────────────────────────────────
// Exit code logic tests
// ──────────────────────────────────────

describe('exit code logic', () => {
  it('exit code 0 when all tests pass (failed === 0)', async () => {
    const md = `# API

## Pass

**Request** → \`POST /v1/items\`

\`\`\`json
{"name": "Exit Code Test"}
\`\`\`

**Response** → \`🟢 201 Created\`

\`\`\`json
{
  "id": "item_xxxxxxxxxxxx",
  "name": "Exit Code Test"
}
\`\`\`
`;
    const result = await runSpec(md, config());
    // CLI uses: process.exit(totalFailed > 0 ? 1 : 0)
    const exitCode = result.failed > 0 ? 1 : 0;
    expect(exitCode).toBe(0);
    expect(result.passed).toBeGreaterThan(0);
  });

  it('exit code 1 when any test fails', async () => {
    const md = `# API

## Fail

**Request** → \`GET /v1/nonexistent\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{"ok": true}
\`\`\`
`;
    const result = await runSpec(md, config());
    const exitCode = result.failed > 0 ? 1 : 0;
    expect(exitCode).toBe(1);
    expect(result.failed).toBeGreaterThan(0);
  });

  it('exit code 0 when spec has no tests (empty spec)', async () => {
    const md = '# Just a title\n\nSome docs.\n';
    const result = await runSpec(md, config());
    // No tests found — should not be treated as failure
    const exitCode = result.failed > 0 ? 1 : 0;
    expect(exitCode).toBe(0);
    expect(result.tests).toEqual([]);
  });

  it('exit code 1 when mixed pass/fail results', async () => {
    const md = `# API

## This passes

**Request** → \`POST /v1/items\`

\`\`\`json
{"name": "Pass"}
\`\`\`

**Response** → \`🟢 201 Created\`

\`\`\`json
{
  "id": "item_xxxxxxxxxxxx",
  "name": "Pass"
}
\`\`\`

## This fails

**Request** → \`GET /v1/nonexistent\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{"ok": true}
\`\`\`
`;
    const result = await runSpec(md, config());
    const exitCode = result.failed > 0 ? 1 : 0;
    expect(exitCode).toBe(1);
    expect(result.passed).toBeGreaterThan(0);
    expect(result.failed).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────
// findSpecFiles — process.exit on nonexistent path
// ──────────────────────────────────────

describe('findSpecFiles error handling', () => {
  it('calls process.exit(1) for nonexistent path', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as any);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => findSpecFiles('/nonexistent/path/to/nowhere')).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalled();

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
