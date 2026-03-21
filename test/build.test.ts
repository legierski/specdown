/**
 * Build integration tests — verify the compiled binary works end-to-end.
 * These run the actual dist/cli.js against real fixture files and a real HTTP server.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Path to the compiled binary
const CLI = resolve(__dirname, '../dist/cli.js');
const TMP = resolve(__dirname, '__build-test-tmp__');

let server: Server;
let port: number;
const store: Record<string, any> = {};

beforeAll(async () => {
  // Start a real test HTTP server
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
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(item || { id, name: 'Default' }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"status": "ok"}');
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

  // Create tmp directory with test spec files
  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
  mkdirSync(TMP, { recursive: true });

  // Write a simple passing spec
  writeFileSync(join(TMP, 'health.spec.md'), `# Health Check

## Check health endpoint

**Request** → \`GET /health\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{"status": "ok"}
\`\`\`
`);

  // Write a failing spec
  writeFileSync(join(TMP, 'failing.spec.md'), `# Failing Spec

## This will fail

**Request** → \`GET /v1/nonexistent\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{"ok": true}
\`\`\`
`);

  // Write a chaining spec
  writeFileSync(join(TMP, 'chain.spec.md'), `# Chain Test

## Create and retrieve item

**Request** → \`POST /v1/items\`

\`\`\`json
{"name": "Build Test Item"}
\`\`\`

**Response** → \`🟢 201 Created\`

\`\`\`json
{
  "id": "item_xxxxxxxxxxxx",  // save as: $item_id
  "name": "Build Test Item"
}
\`\`\`

**Request** → \`GET /v1/items/$item_id\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{
  "id": "$item_id",
  "name": "Build Test Item"
}
\`\`\`
`);
});

afterAll(async () => {
  server.close();
  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
});

async function runCLI(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [CLI, ...args], {
      timeout: 10000,
      cwd,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      exitCode: err.code || 1,
    };
  }
}

// ──────────────────────────────────────
// Binary tests
// ──────────────────────────────────────

describe('built CLI binary', () => {
  it('--help prints usage and exits 0', async () => {
    const { stdout, exitCode } = await runCLI(['--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('specdown');
    expect(stdout).toContain('specdown run');
    expect(stdout).toContain('--base');
    expect(stdout).toContain('--format');
  });

  it('runs a passing spec and exits 0', async () => {
    const { stdout, exitCode } = await runCLI([
      'run',
      join(TMP, 'health.spec.md'),
      '--base', `http://localhost:${port}`,
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('✓');
    expect(stdout).toContain('Check health endpoint');
    expect(stdout).toContain('1 passed');
  });

  it('runs a failing spec and exits 1', async () => {
    const { stdout, exitCode } = await runCLI([
      'run',
      join(TMP, 'failing.spec.md'),
      '--base', `http://localhost:${port}`,
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).toContain('✗');
    expect(stdout).toContain('1 failed');
  });

  it('runs a chaining spec with variable passing', async () => {
    const { stdout, exitCode } = await runCLI([
      'run',
      join(TMP, 'chain.spec.md'),
      '--base', `http://localhost:${port}`,
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('✓');
    expect(stdout).toContain('Create and retrieve item');
  });

  it('outputs JSON with --format json', async () => {
    const { stdout, exitCode } = await runCLI([
      'run',
      join(TMP, 'health.spec.md'),
      '--base', `http://localhost:${port}`,
      '--format', 'json',
    ]);
    expect(exitCode).toBe(0);
    const json = JSON.parse(stdout);
    expect(json.passed).toBe(1);
    expect(json.failed).toBe(0);
    expect(json.files).toHaveLength(1);
    expect(json.files[0].tests[0].name).toBe('Check health endpoint');
    expect(json.files[0].tests[0].passed).toBe(true);
  });

  it('runs all spec files in a directory', async () => {
    // Create a subdirectory with just passing specs
    const passingDir = join(TMP, 'passing');
    mkdirSync(passingDir, { recursive: true });
    writeFileSync(join(passingDir, 'a.spec.md'), `# A\n\n## Check health\n\n**Request** → \`GET /health\`\n\n**Response** → \`🟢 200 OK\`\n\n\`\`\`json\n{"status": "ok"}\n\`\`\`\n`);
    writeFileSync(join(passingDir, 'b.spec.md'), `# B\n\n## Check health again\n\n**Request** → \`GET /health\`\n\n**Response** → \`🟢 200 OK\`\n\n\`\`\`json\n{"status": "ok"}\n\`\`\`\n`);

    const { stdout, exitCode } = await runCLI([
      'run',
      passingDir,
      '--base', `http://localhost:${port}`,
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('2 passed');
  });

  it('fails with error when spec file does not exist', async () => {
    const { exitCode } = await runCLI([
      'run',
      '/nonexistent/path.spec.md',
      '--base', `http://localhost:${port}`,
    ]);
    expect(exitCode).toBe(1);
  });

  it('fails with error when no spec files found in directory', async () => {
    const emptyDir = join(TMP, 'empty');
    mkdirSync(emptyDir, { recursive: true });
    const { exitCode } = await runCLI([
      'run',
      emptyDir,
      '--base', `http://localhost:${port}`,
    ]);
    expect(exitCode).toBe(1);
  });

  it('shows helpful error when run with no args and docs/ does not exist', async () => {
    // Run from a temp dir that has no docs/ subdirectory
    const noDocsDir = join(TMP, 'nodocs');
    mkdirSync(noDocsDir, { recursive: true });

    const { stdout, stderr, exitCode } = await runCLI(['run', '--base', `http://localhost:${port}`], noDocsDir);
    expect(exitCode).toBe(1);
    const output = stdout + stderr;
    // Should mention docs/ and give actionable guidance — not just "does not exist"
    expect(output).toMatch(/docs\//);
    expect(output).toMatch(/specdown run/);
  });
});
