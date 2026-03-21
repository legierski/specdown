import { describe, it, expect } from 'vitest';
import { parseMarkdownSpec } from '../src/parser.js';

describe('parseMarkdownSpec', () => {
  it('parses a simple request/response pair', () => {
    const md = `# My API

## Create a user

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
  "email": "sarah@example.com"
}
\`\`\`
`;
    const tests = parseMarkdownSpec(md);
    expect(tests).toHaveLength(1);
    expect(tests[0].name).toBe('Create a user');
    expect(tests[0].steps).toHaveLength(1);

    const step = tests[0].steps[0];
    expect(step.method).toBe('POST');
    expect(step.path).toBe('/v1/users');
    expect(step.body).toEqual({ email: 'sarah@example.com', name: 'Sarah' });
    expect(step.status).toBe(201);
    expect(step.response).toEqual({ id: 'user_xxxxxxxxxxxx', email: 'sarah@example.com' });
  });

  it('parses GET request without body', () => {
    const md = `# API

## Get a user

**Request** → \`GET /v1/users/123\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{
  "id": "123",
  "name": "Sarah"
}
\`\`\`
`;
    const tests = parseMarkdownSpec(md);
    expect(tests).toHaveLength(1);
    const step = tests[0].steps[0];
    expect(step.method).toBe('GET');
    expect(step.path).toBe('/v1/users/123');
    expect(step.body).toBeNull();
    expect(step.status).toBe(200);
  });

  it('parses multiple tests from one file', () => {
    const md = `# API

## First test

**Request** → \`GET /v1/a\`

**Response** → \`🟢 200 OK\`

## Second test

**Request** → \`GET /v1/b\`

**Response** → \`🟢 200 OK\`

## Third test

**Request** → \`POST /v1/c\`

\`\`\`json
{"key": "value"}
\`\`\`

**Response** → \`🟢 201 Created\`
`;
    const tests = parseMarkdownSpec(md);
    expect(tests).toHaveLength(3);
    expect(tests[0].name).toBe('First test');
    expect(tests[1].name).toBe('Second test');
    expect(tests[2].name).toBe('Third test');
  });

  it('parses chained steps within a single test', () => {
    const md = `# API

## Create and then fetch

**Request** → \`POST /v1/users\`

\`\`\`json
{"name": "Sarah"}
\`\`\`

**Response** → \`🟢 201 Created\`

\`\`\`json
{
  "id": "user_xxxxxxxxxxxx"
}
\`\`\`

**Request** → \`GET /v1/users/123\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{
  "id": "123",
  "name": "Sarah"
}
\`\`\`
`;
    const tests = parseMarkdownSpec(md);
    expect(tests).toHaveLength(1);
    expect(tests[0].steps).toHaveLength(2);
    expect(tests[0].steps[0].method).toBe('POST');
    expect(tests[0].steps[1].method).toBe('GET');
  });

  it('parses response without body (204 No Content)', () => {
    const md = `# API

## Delete a user

**Request** → \`DELETE /v1/users/123\`

**Response** → \`🟢 204 No Content\`
`;
    const tests = parseMarkdownSpec(md);
    expect(tests).toHaveLength(1);
    const step = tests[0].steps[0];
    expect(step.method).toBe('DELETE');
    expect(step.status).toBe(204);
    expect(step.response).toBeNull();
  });

  it('parses error responses', () => {
    const md = `# API

## Not found

**Request** → \`GET /v1/users/nonexistent\`

**Response** → \`🔴 404 Not Found\`

\`\`\`json
{
  "error": "any-text"
}
\`\`\`
`;
    const tests = parseMarkdownSpec(md);
    expect(tests).toHaveLength(1);
    expect(tests[0].steps[0].status).toBe(404);
  });

  it('parses annotations from JSON comments', () => {
    const md = `# API

## With annotations

**Request** → \`POST /v1/events\`

\`\`\`json
{"event": "test"}
\`\`\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{
  "event_id": "evt_xxxxxxxxxxxx",  // save as: $event_id
  "status": "received"
}
\`\`\`
`;
    const tests = parseMarkdownSpec(md);
    const step = tests[0].steps[0];
    expect(step.responseAnnotations['event_id']).toBe('save as: $event_id');
  });

  it('parses custom headers block', () => {
    const md = `# API

## With custom headers

**Headers**

\`\`\`http
Authorization: Bearer custom_key
X-Custom: value
\`\`\`

**Request** → \`POST /v1/events\`

\`\`\`json
{"event": "test"}
\`\`\`

**Response** → \`🟢 200 OK\`
`;
    const tests = parseMarkdownSpec(md);
    const step = tests[0].steps[0];
    expect(step.headers['Authorization']).toBe('Bearer custom_key');
    expect(step.headers['X-Custom']).toBe('value');
  });

  it('handles header removal with none value', () => {
    const md = `# API

## Without auth

**Headers**

\`\`\`http
Authorization: none
\`\`\`

**Request** → \`GET /v1/public\`

**Response** → \`🟢 200 OK\`
`;
    const tests = parseMarkdownSpec(md);
    const step = tests[0].steps[0];
    expect(step.headers['Authorization']).toBe('none');
  });

  it('handles partial matching with ellipsis', () => {
    const md = `# API

## Partial response

**Request** → \`GET /v1/users/1\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{
  "id": "1",
  "name": "Sarah",
  ...
}
\`\`\`
`;
    const tests = parseMarkdownSpec(md);
    const step = tests[0].steps[0];
    expect(step.response).toEqual({ id: '1', name: 'Sarah' });
  });

  it('supports ascii arrow ->', () => {
    const md = `# API

## Ascii arrow

**Request** -> \`GET /v1/test\`

**Response** -> \`🟢 200 OK\`
`;
    const tests = parseMarkdownSpec(md);
    expect(tests).toHaveLength(1);
    expect(tests[0].steps[0].method).toBe('GET');
    expect(tests[0].steps[0].path).toBe('/v1/test');
  });

  it('ignores text between steps (documentation prose)', () => {
    const md = `# API

## Documented test

Here is some documentation about what this test does.
It can span multiple lines.

**Request** → \`POST /v1/users\`

\`\`\`json
{"name": "Sarah"}
\`\`\`

Now let's check the response.

**Response** → \`🟢 201 Created\`

\`\`\`json
{"id": "1"}
\`\`\`

And that's how you create a user.
`;
    const tests = parseMarkdownSpec(md);
    expect(tests).toHaveLength(1);
    expect(tests[0].steps[0].body).toEqual({ name: 'Sarah' });
    expect(tests[0].steps[0].response).toEqual({ id: '1' });
  });

  // ──────────────────────────────────────
  // Emoji flexibility on response status line
  // ──────────────────────────────────────

  it('parses status with no emoji', () => {
    const md = `# API\n\n## Test\n\n**Request** → \`GET /v1/ping\`\n\n**Response** → \`200 OK\`\n`;
    const tests = parseMarkdownSpec(md);
    expect(tests[0].steps[0].status).toBe(200);
  });

  it('parses status with arbitrary emoji (not 🟢)', () => {
    const md = `# API\n\n## Test\n\n**Request** → \`GET /v1/ping\`\n\n**Response** → \`🚀 201 Created\`\n`;
    const tests = parseMarkdownSpec(md);
    expect(tests[0].steps[0].status).toBe(201);
  });

  it('parses status with multiple emoji', () => {
    const md = `# API\n\n## Test\n\n**Request** → \`DELETE /v1/resource\`\n\n**Response** → \`⚠️ 🔴 404 Not Found\`\n`;
    const tests = parseMarkdownSpec(md);
    expect(tests[0].steps[0].status).toBe(404);
  });

  // ──────────────────────────────────────
  // Headers block ordering: before OR after Request
  // ──────────────────────────────────────

  it('accepts **Headers** after **Request** (HTTP message order)', () => {
    const md = `# API

## Remove auth

**Request** → \`GET /v1/protected\`

**Headers**

\`\`\`http
Authorization:
X-Custom: injected
\`\`\`

**Response** → \`🟢 200 OK\`
`;
    const tests = parseMarkdownSpec(md);
    const step = tests[0].steps[0];
    // Headers after Request should apply to THIS step (same as if before)
    expect(step.headers['Authorization']).toBe('');
    expect(step.headers['X-Custom']).toBe('injected');
  });

  it('headers after request do not bleed into next step', () => {
    const md = `# API

## Step 1

**Request** → \`GET /v1/a\`

**Headers**

\`\`\`http
X-Step: one
\`\`\`

**Response** → \`🟢 200 OK\`

## Step 2

**Request** → \`GET /v1/b\`

**Response** → \`🟢 200 OK\`
`;
    const tests = parseMarkdownSpec(md);
    expect(tests[0].steps[0].headers['X-Step']).toBe('one');
    expect(tests[1].steps[0].headers['X-Step']).toBeUndefined();
  });
});
