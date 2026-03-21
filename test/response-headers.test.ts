/**
 * Response header assertion tests.
 *
 * Spec syntax:
 *   **Response Headers**
 *   ```http
 *   Content-Type: application/json
 *   X-Request-Id: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *   ```
 *
 * Placed between **Response** status line and optional response body.
 *
 * Match semantics:
 *   - Header names: case-insensitive (RFC 7230)
 *   - Header values: existing pattern matching (xx+, 00+ patterns)
 *   - Full value match — `application/json` does NOT match `application/json; charset=utf-8`
 *     (documented gotcha; use pattern `application/json xxxxxxxxxxxxxxxxxxxx` to handle charset)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { parseMarkdownSpec } from '../src/parser.js';
import { runSpec } from '../src/runner.js';
import type { SpecConfig } from '../src/config.js';

// ──────────────────────────────────────
// Parser: responseHeaders field on Step
// ──────────────────────────────────────

describe('parseMarkdownSpec response headers', () => {
  it('parses **Response Headers** block into step.responseHeaders', () => {
    const md = `
# API

## Get user

**Request** → \`GET /v1/users/1\`

**Response** → \`🟢 200 OK\`

**Response Headers**

\`\`\`http
Content-Type: application/json
X-Version: 2
\`\`\`

\`\`\`json
{"id": 1}
\`\`\`
`;
    const { tests } = parseMarkdownSpec(md);
    expect(tests).toHaveLength(1);
    const step = tests[0].steps[0];
    expect(step.responseHeaders).toBeDefined();
    expect(step.responseHeaders!['Content-Type']).toBe('application/json');
    expect(step.responseHeaders!['X-Version']).toBe('2');
  });

  it('step.responseHeaders is empty object when no **Response Headers** block', () => {
    const md = `
# API

## Health check

**Request** → \`GET /health\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{"status": "ok"}
\`\`\`
`;
    const { tests } = parseMarkdownSpec(md);
    const step = tests[0].steps[0];
    expect(step.responseHeaders).toEqual({});
  });

  it('preserves header name casing as written (comparison is case-insensitive at match time)', () => {
    const md = `
# API

## Test

**Request** → \`GET /health\`

**Response** → \`🟢 200 OK\`

**Response Headers**

\`\`\`http
content-type: application/json
\`\`\`
`;
    const { tests } = parseMarkdownSpec(md);
    const step = tests[0].steps[0];
    expect(step.responseHeaders!['content-type']).toBe('application/json');
  });

  it('parses response headers with no body after', () => {
    const md = `
# API

## Check headers only

**Request** → \`GET /health\`

**Response** → \`🟢 200 OK\`

**Response Headers**

\`\`\`http
X-Powered-By: specdown
\`\`\`
`;
    const { tests } = parseMarkdownSpec(md);
    const step = tests[0].steps[0];
    expect(step.responseHeaders!['X-Powered-By']).toBe('specdown');
    expect(step.response).toBeNull();
  });
});

// ──────────────────────────────────────
// Runner: response header assertion
// ──────────────────────────────────────

let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://localhost');

    if (url.pathname === '/health') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'X-Version': '2',
        'X-Request-Id': 'abc123def456abc123def456abc123de',
      });
      res.end('{"status": "ok"}');
      return;
    }

    if (url.pathname === '/with-charset') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      res.end('{"ok": true}');
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

describe('runSpec response header assertions', () => {
  it('asserted header matches exactly → passes', async () => {
    const md = `
# API

## Check content type

**Request** → \`GET /health\`

**Response** → \`🟢 200 OK\`

**Response Headers**

\`\`\`http
Content-Type: application/json
\`\`\`
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('asserted header value mismatch → fails with clear error', async () => {
    const md = `
# API

## Check wrong content type

**Request** → \`GET /health\`

**Response** → \`🟢 200 OK\`

**Response Headers**

\`\`\`http
Content-Type: application/xml
\`\`\`
`;
    const result = await runSpec(md, config());
    expect(result.failed).toBe(1);
    expect(result.tests[0].errors[0]).toMatch(/Content-Type/);
    expect(result.tests[0].errors[0]).toMatch(/application\/xml/);
    expect(result.tests[0].errors[0]).toMatch(/application\/json/);
  });

  it('asserted header absent from response → fails with missing error', async () => {
    const md = `
# API

## Check missing header

**Request** → \`GET /health\`

**Response** → \`🟢 200 OK\`

**Response Headers**

\`\`\`http
X-Does-Not-Exist: anything
\`\`\`
`;
    const result = await runSpec(md, config());
    expect(result.failed).toBe(1);
    expect(result.tests[0].errors[0]).toMatch(/X-Does-Not-Exist/);
    expect(result.tests[0].errors[0]).toMatch(/missing/i);
  });

  it('header name comparison is case-insensitive', async () => {
    const md = `
# API

## Check lowercase header name

**Request** → \`GET /health\`

**Response** → \`🟢 200 OK\`

**Response Headers**

\`\`\`http
content-type: application/json
\`\`\`
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1);
  });

  it('pattern match in header value (x-placeholder)', async () => {
    const md = `
# API

## Check request id pattern

**Request** → \`GET /health\`

**Response** → \`🟢 200 OK\`

**Response Headers**

\`\`\`http
X-Request-Id: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
\`\`\`
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1);
  });

  it('no response headers block → always passes (no assertion)', async () => {
    const md = `
# API

## No header assertion

**Request** → \`GET /health\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{"status": "ok"}
\`\`\`
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1);
  });

  it('headers-only assertion with no body check', async () => {
    const md = `
# API

## Headers only

**Request** → \`GET /health\`

**Response** → \`🟢 200 OK\`

**Response Headers**

\`\`\`http
Content-Type: application/json
X-Version: 2
\`\`\`
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1);
  });

  it('multiple header assertions — one fails → test fails with that header error', async () => {
    const md = `
# API

## Check multiple headers one wrong

**Request** → \`GET /health\`

**Response** → \`🟢 200 OK\`

**Response Headers**

\`\`\`http
Content-Type: application/json
X-Version: 999
\`\`\`
`;
    const result = await runSpec(md, config());
    expect(result.failed).toBe(1);
    expect(result.tests[0].errors[0]).toMatch(/X-Version/);
  });

  it('DOCUMENTED GOTCHA: exact match fails when server appends charset', async () => {
    // Server returns: Content-Type: application/json; charset=utf-8
    // Spec asserts:   Content-Type: application/json
    // This is a mismatch — full value comparison, not substring
    // Fix: use pattern `Content-Type: application/json xxxxxxxxxxxxxxxxxxxx`
    const md = `
# API

## Charset gotcha

**Request** → \`GET /with-charset\`

**Response** → \`🟢 200 OK\`

**Response Headers**

\`\`\`http
Content-Type: application/json
\`\`\`
`;
    const result = await runSpec(md, config());
    // This FAILS — documenting the exact/pattern semantics explicitly
    expect(result.failed).toBe(1);
    expect(result.tests[0].errors[0]).toMatch(/Content-Type/);
  });

  it('pattern match handles charset: application/json + pattern covers the rest', async () => {
    // Workaround for the charset gotcha: use a pattern
    const md = `
# API

## Charset workaround with pattern

**Request** → \`GET /with-charset\`

**Response** → \`🟢 200 OK\`

**Response Headers**

\`\`\`http
Content-Type: application/json; charset=xxxxx
\`\`\`
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1);
  });
});
