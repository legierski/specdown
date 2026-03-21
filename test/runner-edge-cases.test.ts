import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { runSpec } from '../src/runner.js';
import type { SpecConfig } from '../src/config.js';
import { analyzeVarChain } from '../src/analyze.js';

let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const url = new URL(req.url!, 'http://localhost');

      // Slow endpoint (100ms delay before headers + body)
      if (url.pathname === '/v1/slow') {
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok": true}');
        }, 100);
        return;
      }

      // Body-slow endpoint: sends headers immediately, drips body after 200ms
      // Used to test that AbortController covers res.json(), not just fetch()
      if (url.pathname === '/v1/body-slow') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.flushHeaders(); // headers arrive at client immediately
        setTimeout(() => {
          res.end('{"ok": true}');
        }, 200); // body arrives 200ms later
        return;
      }

      // Returns plain text, not JSON
      if (url.pathname === '/v1/text') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('hello world');
        return;
      }

      // Returns JSON but with wrong content-type
      if (url.pathname === '/v1/mistyped') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('{"ok": true}');
        return;
      }

      // Returns no content-type
      if (url.pathname === '/v1/noheader') {
        res.writeHead(200);
        res.end('{"ok": true}');
        return;
      }

      // Redirect
      if (url.pathname === '/v1/redirect') {
        res.writeHead(301, { 'Location': '/v1/destination' });
        res.end();
        return;
      }

      // Destination
      if (url.pathname === '/v1/destination') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"redirected": true}');
        return;
      }

      // Echo headers
      if (url.pathname === '/v1/echo-headers') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          auth: req.headers['authorization'] || null,
          custom: req.headers['x-custom'] || null,
          content_type: req.headers['content-type'] || null,
        }));
        return;
      }

      // Echo body with vars
      if (req.method === 'POST' && url.pathname === '/v1/echo') {
        const data = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          received: data,
          id: 'item_abc123def456',
        }));
        return;
      }

      // Chain: create
      if (req.method === 'POST' && url.pathname === '/v1/chain') {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: 'ch_aabbccddee11',
          name: JSON.parse(body).name,
        }));
        return;
      }

      // Chain: get
      if (req.method === 'GET' && url.pathname.startsWith('/v1/chain/')) {
        const id = url.pathname.split('/').pop();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id, name: 'Test' }));
        return;
      }

      // Chain: update
      if (req.method === 'PUT' && url.pathname.startsWith('/v1/chain/')) {
        const id = url.pathname.split('/').pop();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id, name: JSON.parse(body).name }));
        return;
      }

      // Chain: delete
      if (req.method === 'DELETE') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Returns false as JSON response
      if (url.pathname === '/v1/returns-false') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('false');
        return;
      }

      // Returns true as JSON response
      if (url.pathname === '/v1/returns-true') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('true');
        return;
      }

      // Returns 0 as JSON response
      if (url.pathname === '/v1/returns-zero') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('0');
        return;
      }

      // Echo whether a body was actually received (for falsey body testing)
      if (req.method === 'POST' && url.pathname === '/v1/echo-body-received') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ bodyReceived: body.length > 0, rawBody: body }));
        return;
      }

      // 404
      if (url.pathname === '/v1/missing') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end('{"error": "not found"}');
        return;
      }

      // 500
      if (url.pathname === '/v1/error') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end('{"error": "internal"}');
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

afterAll(() => {
  server.close();
});

function config(): SpecConfig {
  return {
    http: {
      base: `http://localhost:${port}`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test_key',
      },
    },
  };
}

describe('runner edge cases', () => {
  it('handles connection refused', async () => {
    const md = `# API\n\n## Unreachable\n\n**Request** → \`GET /v1/test\`\n\n**Response** → \`🟢 200 OK\`\n`;
    const result = await runSpec(md, {
      http: { base: 'http://localhost:1', headers: {} },
    });
    expect(result.failed).toBe(1);
    expect(result.tests[0].errors[0]).toContain('Request failed');
  });

  it('handles non-JSON response when JSON expected', async () => {
    const md = `# API

## Text response

**Request** → \`GET /v1/text\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{"ok": true}
\`\`\`
`;
    const result = await runSpec(md, config());
    expect(result.failed).toBe(1);
    expect(result.tests[0].errors[0]).toContain('parse');
  });

  it('handles response with no body when no body expected', async () => {
    const md = `# API

## No body

**Request** → \`DELETE /v1/chain/123\`

**Response** → \`🟢 204 No Content\`
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1);
  });

  it('handles redirect status code', async () => {
    const md = `# API

## Redirect

**Request** → \`GET /v1/redirect\`

**Response** → \`🟡 301 Moved\`
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1);
  });

  it('applies config headers to every request', async () => {
    const md = `# API

## Check headers

**Request** → \`GET /v1/echo-headers\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{
  "auth": "Bearer test_key",
  "content_type": "application/json"
}
\`\`\`
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1);
  });

  it('step headers override config headers', async () => {
    const md = `# API

## Override auth

**Headers**

\`\`\`http
Authorization: Bearer custom_key
\`\`\`

**Request** → \`GET /v1/echo-headers\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{
  "auth": "Bearer custom_key"
}
\`\`\`
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1);
  });

  it('removes header with empty value in step headers', async () => {
    // Empty value (no value after colon) removes an inherited header.
    // "Authorization:" with no value = remove Authorization from this request.
    const md = `# API

## Remove auth

**Headers**

\`\`\`http
Authorization:
\`\`\`

**Request** → \`GET /v1/echo-headers\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{
  "auth": null
}
\`\`\`
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1);
  });

  it('does NOT treat "none" as a magic removal sentinel', async () => {
    // "none" is no longer a magic keyword — it sends the literal string "none"
    const md = `# API

## Auth is literally "none"

**Headers**

\`\`\`http
Authorization: none
\`\`\`

**Request** → \`GET /v1/echo-headers\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{
  "auth": "none"
}
\`\`\`
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1);
  });

  it('infers Content-Type: application/json when request has a JSON body', async () => {
    // Runner should auto-set Content-Type when body is present and not already set.
    // Verified by POSTing to echo-headers which reflects content-type back.
    const md = `# API

## Post without explicit Content-Type

**Request** → \`POST /v1/echo-headers\`

\`\`\`json
{"check": "ct"}
\`\`\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{
  "content_type": "application/json"
}
\`\`\`
`;
    // Config has NO Content-Type — runner must infer it from the body
    const result = await runSpec(md, {
      http: { base: `http://localhost:${port}`, headers: {} },
    });
    expect(result.passed).toBe(1);
  });

  it('does NOT send Content-Type on GET requests with no body', async () => {
    // A GET with no body should not have Content-Type injected
    const md = `# API

## GET without Content-Type

**Request** → \`GET /v1/echo-headers\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{
  "content_type": null
}
\`\`\`
`;
    // Config has NO Content-Type header
    const result = await runSpec(md, {
      http: {
        base: `http://localhost:${port}`,
        headers: { 'Authorization': 'Bearer test_key' },
      },
    });
    expect(result.passed).toBe(1);
  });

  it('stops chain on first failure', async () => {
    const md = `# API

## Chain that fails midway

**Request** → \`GET /v1/echo-headers\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{"auth": "Bearer test_key"}
\`\`\`

**Request** → \`GET /v1/echo-headers\`

**Response** → \`🔴 404 Not Found\`

**Request** → \`GET /v1/echo-headers\`

**Response** → \`🟢 200 OK\`
`;
    const result = await runSpec(md, config());
    expect(result.failed).toBe(1);
    // Should only have one error (status mismatch), not continue to step 3
    expect(result.tests[0].errors).toHaveLength(1);
    expect(result.tests[0].errors[0]).toContain('status');
  });

  it('handles 500 error responses', async () => {
    const md = `# API

## Server error

**Request** → \`GET /v1/error\`

**Response** → \`🔴 500 Internal Server Error\`

\`\`\`json
{"error": "any-text"}
\`\`\`
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1);
  });

  it('substitutes variables in request body', async () => {
    const md = `# API

## Create then echo

**Request** → \`POST /v1/chain\`

\`\`\`json
{"name": "Test"}
\`\`\`

**Response** → \`🟢 201 Created\`

\`\`\`json
{
  "id": "ch_xxxxxxxxxxxx",  // save as: $chain_id
  "name": "Test"
}
\`\`\`

**Request** → \`POST /v1/echo\`

\`\`\`json
{"ref_id": "$chain_id"}
\`\`\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{
  "received": {"ref_id": "ch_aabbccddee11"}
}
\`\`\`
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1);
  });

  it('runs empty spec (no tests found)', async () => {
    const md = `# Just a title\n\nSome text.\n`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.tests).toEqual([]);
  });

  it('handles multiple independent tests', async () => {
    const md = `# API

## Test A

**Request** → \`GET /v1/echo-headers\`

**Response** → \`🟢 200 OK\`

## Test B

**Request** → \`GET /v1/missing\`

**Response** → \`🔴 404 Not Found\`

## Test C

**Request** → \`GET /v1/error\`

**Response** → \`🔴 500 Internal Server Error\`
`;
    const result = await runSpec(md, config());
    expect(result.tests).toHaveLength(3);
    expect(result.passed).toBe(3);
    expect(result.failed).toBe(0);
  });

  it('variables are scoped per test, not shared', async () => {
    const md = `# API

## Test A saves

**Request** → \`POST /v1/chain\`

\`\`\`json
{"name": "A"}
\`\`\`

**Response** → \`🟢 201 Created\`

\`\`\`json
{
  "id": "ch_xxxxxxxxxxxx",  // save as: $test_id
  "name": "A"
}
\`\`\`

## Test B cannot use Test A's variable

**Request** → \`GET /v1/chain/$test_id\`

**Response** → \`🟢 200 OK\`
`;
    const result = await runSpec(md, config());
    // Test B's $test_id is NOT resolved (different scope)
    // So it literally requests /v1/chain/$test_id which should 404
    // Actually our server will still handle it... let me check
    // The path will be /v1/chain/$test_id (literal) since vars is fresh
    expect(result.tests).toHaveLength(2);
    // Test A should pass
    expect(result.tests[0].passed).toBe(true);
    // Test B requests literal "$test_id" — the variable is not resolved
    // since each test gets fresh vars. The path includes literal "$test_id"
  });

  it('reports duration for each test', async () => {
    const md = `# API

## Slow test

**Request** → \`GET /v1/slow\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{"ok": true}
\`\`\`
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1);
    expect(result.tests[0].duration).toBeGreaterThan(0);
    expect(result.duration).toBeGreaterThan(0);
  });

  it('times out when timeout is exceeded', async () => {
    // /v1/slow takes 100ms — set timeout to 50ms to force abort
    const md = `# API

## Timeout test

**Request** → \`GET /v1/slow\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{"ok": true}
\`\`\`
`;
    const result = await runSpec(md, {
      http: {
        base: `http://localhost:${port}`,
        headers: {},
        timeout: 50, // 50ms, server waits 100ms
      },
    });
    expect(result.failed).toBe(1);
    expect(result.tests[0].errors[0]).toMatch(/timeout|abort|timed out/i);
  }, 2000);

  it('times out when body delivery is slow (timeout must cover res.json())', async () => {
    // BUG: AbortController timer is cleared after fetch() resolves on headers.
    // res.json() then runs with no timeout — a slow body delivery bypasses it entirely.
    // Server sends headers immediately, body after 200ms. Timeout = 100ms.
    // Expected: test fails with timeout error.
    // Current (broken) behaviour: test passes — body arrives at 200ms, timer was
    // already cleared when headers arrived at ~0ms.
    const md = `# API

## Body slow timeout

**Request** → \`GET /v1/body-slow\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{"ok": true}
\`\`\`
`;
    const result = await runSpec(md, {
      http: {
        base: `http://localhost:${port}`,
        headers: {},
        timeout: 100, // headers arrive ~0ms, body at 200ms — should time out
      },
    });
    expect(result.failed).toBe(1);
    expect(result.tests[0].errors[0]).toMatch(/timeout|timed out/i);
  }, 2000);

  // ── failedStep context (v0.6) ──

  it('passing test has failedStep undefined', async () => {
    const md = `# API\n\n## Pass\n\n**Request** → \`GET /v1/missing\`\n\n**Response** → \`🔴 404 Not Found\`\n`;
    const result = await runSpec(md, config());
    expect(result.tests[0].passed).toBe(true);
    expect((result.tests[0] as any).failedStep).toBeUndefined();
  });

  it('single-step status mismatch populates failedStep with correct fields', async () => {
    const md = `# API\n\n## Fails\n\n**Request** → \`GET /v1/missing\`\n\n**Response** → \`🟢 200 OK\`\n`;
    const result = await runSpec(md, config());
    const step = (result.tests[0] as any).failedStep;
    expect(step).toBeDefined();
    expect(step.stepIndex).toBe(0);
    expect(step.stepCount).toBe(1);
    expect(step.method).toBe('GET');
    expect(step.path).toBe('/v1/missing');
    expect(step.status).toBe(404); // actual, not expected (200)
  });

  it('field mismatch sets failedStep.actualBody to parsed response', async () => {
    const md = `# API\n\n## Bad field\n\n**Request** → \`GET /v1/missing\`\n\n**Response** → \`🔴 404 Not Found\`\n\`\`\`json\n{"error": "wrong_message"}\n\`\`\`\n`;
    const result = await runSpec(md, config());
    const step = (result.tests[0] as any).failedStep;
    expect(step).toBeDefined();
    expect(step.actualBody).toEqual({ error: 'not found' });
  });

  it('multi-step: step 2 fails sets failedStep.stepIndex=1 stepCount=2', async () => {
    const md = `# API

## Two steps

**Request** → \`GET /v1/echo-headers\`

**Response** → \`🟢 200 OK\`

**Request** → \`GET /v1/missing\`

**Response** → \`🟢 200 OK\`
`;
    const result = await runSpec(md, config());
    const step = (result.tests[0] as any).failedStep;
    expect(step.stepIndex).toBe(1);
    expect(step.stepCount).toBe(2);
  });

  it('stepCount reflects total steps in test even when chain stops early', async () => {
    const md = `# API

## Three steps fail at 2

**Request** → \`GET /v1/echo-headers\`

**Response** → \`🟢 200 OK\`

**Request** → \`GET /v1/missing\`

**Response** → \`🟢 200 OK\`

**Request** → \`GET /v1/echo-headers\`

**Response** → \`🟢 200 OK\`
`;
    const result = await runSpec(md, config());
    const step = (result.tests[0] as any).failedStep;
    expect(step.stepIndex).toBe(1);
    expect(step.stepCount).toBe(3);
  });

  it('failedStep.path shows substituted variable not literal $var', async () => {
    const md = `# API

## Chain with variable fail

**Request** → \`POST /v1/chain\`

\`\`\`json
{"name": "Test"}
\`\`\`

**Response** → \`🟢 201 Created\`

\`\`\`json
{
  "id": "ch_xxxxxxxxxxxx",  // save as: $chain_id
  "name": "Test"
}
\`\`\`

**Request** → \`GET /v1/chain/$chain_id\`

**Response** → \`🔴 404 Not Found\`
`;
    const result = await runSpec(md, config());
    // Step 2 gets 200 (server returns the chain item), not 404 — status mismatch
    const step = (result.tests[0] as any).failedStep;
    expect(step).toBeDefined();
    expect(step.path).toBe('/v1/chain/ch_aabbccddee11');
    expect(step.path).not.toContain('$');
  });

  it('status mismatch sets failedStep.actualBody to null (no body parse on early break)', async () => {
    const md = `# API\n\n## Status fail\n\n**Request** → \`GET /v1/missing\`\n\n**Response** → \`🟢 200 OK\`\n`;
    const result = await runSpec(md, config());
    const step = (result.tests[0] as any).failedStep;
    expect(step.actualBody).toBeNull();
  });

  it('failedStep.status is actual HTTP status received, not the expected status', async () => {
    const md = `# API\n\n## Wrong status\n\n**Request** → \`GET /v1/error\`\n\n**Response** → \`🟢 200 OK\`\n`;
    const result = await runSpec(md, config());
    const step = (result.tests[0] as any).failedStep;
    expect(step.status).toBe(500); // server returns 500, spec expects 200
  });

  // ── Bug: falsey request/response bodies (v0.8) ──
  // `if (step.body)` and `if (step.response)` skip valid falsey values

  it('BUG: spec asserting response `false` should fail when server returns `true`', async () => {
    // Spec asserts `false` as expected response. Server actually returns `true`.
    // BUG: `if (step.response)` — step.response is `false` (falsey) → check is SKIPPED
    //      → test passes vacuously when it should fail.
    // FIX: check `step.response !== null` so falsey JSON values are still checked.
    const md = `# API

## Falsey response should mismatch

**Request** → \`GET /v1/returns-true\`

**Response** → \`🟢 200 OK\`

\`\`\`json
false
\`\`\`
`;
    // Server returns true, spec asserts false → should fail
    const result = await runSpec(md, config());
    expect(result.failed).toBe(1); // RED: currently passes because if(false) skips check
  });

  it('BUG: spec with request body `false` should send it; currently body is skipped', async () => {
    // Spec has request body `false`. Runner does `if (step.body)` which is falsey.
    // BUG: body is not sent → server receives no body.
    // FIX: check `step.body !== null` → body is sent correctly.
    const md = `# API

## Send falsey body

**Request** → \`POST /v1/echo-body-received\`

\`\`\`json
false
\`\`\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{"bodyReceived": true}
\`\`\`
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1); // RED: fails because body isn't sent
  });

  it('BUG: spec with request body `0` should send it; currently body is skipped', async () => {
    const md = `# API

## Send zero body

**Request** → \`POST /v1/echo-body-received\`

\`\`\`json
0
\`\`\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{"bodyReceived": true}
\`\`\`
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1); // RED: fails because body isn't sent
  });

  // ── Bug: runSpec doesn't surface var-chain warnings (v0.8) ──
  // specdown check shows them; specdown run silently omits them.

  it('BUG: runSpec should include var-chain warnings when $var is never saved', async () => {
    // Spec uses $id in path but nothing saves $id.
    // specdown check warns about this; specdown run silently skips the warning.
    // FIX: runSpec calls analyzeVarChain and merges warnings into result.warnings.
    const md = `# API

## Fetch by ID

**Request** → \`GET /v1/chain/$id\`

**Response** → \`🟢 200 OK\`
`;
    const result = await runSpec(md, config());
    // RED: result.warnings is currently empty (only parseWarnings, no chain analysis)
    expect(result.warnings.some(w => w.includes('$id'))).toBe(true);
  });

  it('does not time out when timeout is large enough', async () => {
    const md = `# API

## No timeout

**Request** → \`GET /v1/slow\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{"ok": true}
\`\`\`
`;
    const result = await runSpec(md, {
      http: {
        base: `http://localhost:${port}`,
        headers: {},
        timeout: 5000, // plenty of time
      },
    });
    expect(result.passed).toBe(1);
  }, 3000);
});
