import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runSpec } from '../src/runner.js';
import type { SpecConfig } from '../src/config.js';

// Test that spec fixture files work correctly through the full pipeline
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
          res.end(JSON.stringify({ id, name: 'Default Item' }));
        }
        return;
      }

      res.writeHead(404);
      res.end();
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
  // Clear store between tests
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

describe('fixture: simple-api.spec.md', () => {
  it('runs the simple API fixture and all tests pass', async () => {
    const md = readFileSync(resolve(__dirname, 'fixtures/simple-api.spec.md'), 'utf-8');
    const result = await runSpec(md, config());
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.tests[0].name).toBe('Create a resource');
    expect(result.tests[1].name).toBe('Get a resource');
  });
});

describe('fixture: chaining.spec.md', () => {
  it('runs the chaining fixture with variable passing', async () => {
    const md = readFileSync(resolve(__dirname, 'fixtures/chaining.spec.md'), 'utf-8');
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.tests[0].name).toBe('Create and verify');
  });
});
