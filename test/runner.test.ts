import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { runSpec } from '../src/runner.js';
import type { SpecConfig } from '../src/config.js';

// Simple test server that echoes back what we need
let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const url = new URL(req.url!, `http://localhost`);

      // POST /v1/users → 201 with id
      if (req.method === 'POST' && url.pathname === '/v1/users') {
        const data = JSON.parse(body);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: 'user_abc123def456',
          email: data.email,
          name: data.name,
        }));
        return;
      }

      // GET /v1/users/:id → 200
      if (req.method === 'GET' && url.pathname.startsWith('/v1/users/')) {
        const id = url.pathname.split('/').pop();
        if (id === 'nonexistent') {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'User not found' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id,
          name: 'Sarah',
        }));
        return;
      }

      // DELETE /v1/users/:id → 204
      if (req.method === 'DELETE' && url.pathname.startsWith('/v1/users/')) {
        res.writeHead(204);
        res.end();
        return;
      }

      // POST /v1/events → 200 with event_id
      if (req.method === 'POST' && url.pathname === '/v1/events') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          event_id: 'evt_abc123def456',
          status: 'received',
        }));
        return;
      }

      // Auth check
      if (url.pathname === '/v1/protected') {
        const auth = req.headers['authorization'];
        if (!auth) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
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

describe('runSpec', () => {
  it('runs a simple POST and validates response', async () => {
    const md = `# API

## Create user

**Request** → \`POST /v1/users\`

\`\`\`json
{
  "email": "sarah@example.com",
  "name": "Sarah"
}
\`\`\`

**Response** → \`🟢 201 Created\`

\`\`\`json
{
  "id": "user_xxxxxxxxxxxx",
  "email": "sarah@example.com",
  "name": "Sarah"
}
\`\`\`
`;
    const results = await runSpec(md, config());
    expect(results.passed).toBe(1);
    expect(results.failed).toBe(0);
    expect(results.tests[0].passed).toBe(true);
  });

  it('runs a GET and validates response', async () => {
    const md = `# API

## Get user

**Request** → \`GET /v1/users/usr_123\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{
  "id": "usr_123",
  "name": "Sarah"
}
\`\`\`
`;
    const results = await runSpec(md, config());
    expect(results.passed).toBe(1);
    expect(results.failed).toBe(0);
  });

  it('detects status code mismatch', async () => {
    const md = `# API

## Should fail

**Request** → \`GET /v1/users/usr_123\`

**Response** → \`🔴 404 Not Found\`
`;
    const results = await runSpec(md, config());
    expect(results.failed).toBe(1);
    expect(results.tests[0].passed).toBe(false);
    expect(results.tests[0].errors[0]).toContain('status');
  });

  it('handles 204 No Content', async () => {
    const md = `# API

## Delete user

**Request** → \`DELETE /v1/users/usr_123\`

**Response** → \`🟢 204 No Content\`
`;
    const results = await runSpec(md, config());
    expect(results.passed).toBe(1);
  });

  it('chains steps with variable passing', async () => {
    const md = `# API

## Create and then fetch

**Request** → \`POST /v1/users\`

\`\`\`json
{
  "email": "sarah@example.com",
  "name": "Sarah"
}
\`\`\`

**Response** → \`🟢 201 Created\`

\`\`\`json
{
  "id": "user_xxxxxxxxxxxx",  // save as: $user_id
  "email": "sarah@example.com"
}
\`\`\`

**Request** → \`GET /v1/users/$user_id\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{
  "id": "$user_id",
  "name": "Sarah"
}
\`\`\`
`;
    const results = await runSpec(md, config());
    expect(results.passed).toBe(1);
    expect(results.failed).toBe(0);
  });

  it('runs multiple tests from one spec', async () => {
    const md = `# API

## First

**Request** → \`POST /v1/events\`

\`\`\`json
{"event": "test"}
\`\`\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{"success": true}
\`\`\`

## Second

**Request** → \`GET /v1/users/usr_1\`

**Response** → \`🟢 200 OK\`
`;
    const results = await runSpec(md, config());
    expect(results.tests).toHaveLength(2);
    expect(results.passed).toBe(2);
  });

  it('applies custom headers per step', async () => {
    // Empty value (no value after colon) removes inherited header
    const md = `# API

## Without auth fails

**Headers**

\`\`\`http
Authorization:
\`\`\`

**Request** → \`GET /v1/protected\`

**Response** → \`🔴 401 Unauthorized\`

\`\`\`json
{"error": "any-text"}
\`\`\`
`;
    const results = await runSpec(md, config());
    expect(results.passed).toBe(1);
  });

  it('returns detailed error info on failure', async () => {
    const md = `# API

## Wrong response

**Request** → \`POST /v1/events\`

\`\`\`json
{"event": "test"}
\`\`\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{
  "success": false
}
\`\`\`
`;
    const results = await runSpec(md, config());
    expect(results.failed).toBe(1);
    expect(results.tests[0].errors.length).toBeGreaterThan(0);
  });
});
