import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runSpec } from '../src/runner.js';
import { parseMarkdownSpec } from '../src/parser.js';
import type { SpecConfig } from '../src/config.js';

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

const fixtureDir = resolve(__dirname, 'fixtures');

describe('integration: malformed spec file', () => {
  it('returns 0 tests for spec with no request/response pairs', async () => {
    const md = readFileSync(resolve(fixtureDir, 'malformed.spec.md'), 'utf-8');
    const result = await runSpec(md, config());
    expect(result.tests).toEqual([]);
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('parser returns empty array for malformed spec', () => {
    const md = readFileSync(resolve(fixtureDir, 'malformed.spec.md'), 'utf-8');
    const { tests } = parseMarkdownSpec(md);
    expect(tests).toEqual([]);
  });
});

describe('integration: error spec file', () => {
  it('reports failure when server returns wrong status', async () => {
    const md = readFileSync(resolve(fixtureDir, 'error.spec.md'), 'utf-8');
    const result = await runSpec(md, config());
    expect(result.failed).toBe(1);
    expect(result.passed).toBe(0);
    expect(result.tests[0].errors[0]).toContain('status');
  });
});

describe('integration: mixed spec file', () => {
  it('only runs sections that have request/response pairs', async () => {
    const md = readFileSync(resolve(fixtureDir, 'mixed.spec.md'), 'utf-8');
    const result = await runSpec(md, config());
    // Only 2 sections have actual tests
    expect(result.tests).toHaveLength(2);
    expect(result.tests[0].name).toBe('Working test');
    expect(result.tests[1].name).toBe('Another working test');
    expect(result.passed).toBe(2);
  });
});

describe('integration: multiple fixture files', () => {
  it('runs all spec files from a directory', async () => {
    // Simulate what the CLI does: read all .spec.md files from fixtures
    const { readdirSync } = await import('node:fs');
    const files = readdirSync(fixtureDir)
      .filter(f => f.endsWith('.spec.md'))
      .sort();

    let totalPassed = 0;
    let totalFailed = 0;

    for (const file of files) {
      const md = readFileSync(resolve(fixtureDir, file), 'utf-8');
      const result = await runSpec(md, config());
      totalPassed += result.passed;
      totalFailed += result.failed;
    }

    // simple-api: 2 pass, chaining: 1 pass, malformed: 0, error: 1 fail, mixed: 2 pass
    expect(totalPassed).toBe(5);
    expect(totalFailed).toBe(1);
  });
});

describe('integration: empty and whitespace inputs', () => {
  it('handles completely empty string', async () => {
    const result = await runSpec('', config());
    expect(result.tests).toEqual([]);
  });

  it('handles whitespace-only string', async () => {
    const result = await runSpec('   \n\n\t\n   ', config());
    expect(result.tests).toEqual([]);
  });

  it('handles spec with only a title', async () => {
    const result = await runSpec('# Just a Title\n', config());
    expect(result.tests).toEqual([]);
  });
});

describe('integration: spec result structure', () => {
  it('returns correct SpecResult shape for passing tests', async () => {
    const md = readFileSync(resolve(fixtureDir, 'simple-api.spec.md'), 'utf-8');
    const result = await runSpec(md, config());

    expect(result).toHaveProperty('tests');
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('failed');
    expect(result).toHaveProperty('duration');
    expect(typeof result.duration).toBe('number');
    expect(result.duration).toBeGreaterThanOrEqual(0);

    for (const test of result.tests) {
      expect(test).toHaveProperty('name');
      expect(test).toHaveProperty('passed');
      expect(test).toHaveProperty('errors');
      expect(test).toHaveProperty('duration');
      expect(typeof test.name).toBe('string');
      expect(typeof test.passed).toBe('boolean');
      expect(Array.isArray(test.errors)).toBe(true);
    }
  });

  it('returns correct SpecResult shape for failing tests', async () => {
    const md = readFileSync(resolve(fixtureDir, 'error.spec.md'), 'utf-8');
    const result = await runSpec(md, config());

    expect(result.failed).toBe(1);
    const failedTest = result.tests[0];
    expect(failedTest.passed).toBe(false);
    expect(failedTest.errors.length).toBeGreaterThan(0);
    expect(typeof failedTest.errors[0]).toBe('string');
  });
});

describe('integration: inline markdown between steps', () => {
  it('handles bold, links, and lists in prose between steps', async () => {
    const md = `# API

## With rich prose

Here is some **bold text** and [a link](http://example.com).

- List item 1
- List item 2

**Request** → \`POST /v1/items\`

\`\`\`json
{"name": "Prose Test"}
\`\`\`

> A blockquote for emphasis

**Response** → \`🟢 201 Created\`

\`\`\`json
{
  "id": "item_xxxxxxxxxxxx",
  "name": "Prose Test"
}
\`\`\`

And some closing text with a [link](http://example.com).
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1);
  });
});
