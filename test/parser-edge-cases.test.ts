import { describe, it, expect } from 'vitest';
import { parseMarkdownSpec } from '../src/parser.js';

// ──────────────────────────────────────────────────────────────
// RED: parseMarkdownSpec should return { tests, warnings }
// not bare Test[]. These tests will fail until the parser is
// updated to track parse warnings.
// ──────────────────────────────────────────────────────────────

describe('parser — warnings shape (RED until parser updated)', () => {
  it('returns { tests, warnings } object not a bare array', () => {
    const result = parseMarkdownSpec('');
    expect(result).toHaveProperty('tests');
    expect(result).toHaveProperty('warnings');
    expect(Array.isArray((result as any).tests)).toBe(true);
    expect(Array.isArray((result as any).warnings)).toBe(true);
  });

  it('emits no warnings for a valid spec', () => {
    const md = `# API\n\n## Get users\n\n**Request** → \`GET /v1/users\`\n\n**Response** → \`🟢 200 OK\`\n`;
    const { warnings } = parseMarkdownSpec(md) as any;
    expect(warnings).toHaveLength(0);
  });

  it('warns when a ## section has no valid steps (prose-only section)', () => {
    const md = `# API\n\n## Introduction\n\nThis section has no request.\n`;
    const { warnings } = parseMarkdownSpec(md) as any;
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/Introduction/);
  });

  it('warns when Request has no Response status code (step silently dropped today)', () => {
    const md = `# API\n\n## Bad response\n\n**Request** → \`GET /v1/test\`\n\n**Response** → \`OK\`\n`;
    const { tests, warnings } = parseMarkdownSpec(md) as any;
    // Step is still dropped — test should be empty
    expect(tests).toHaveLength(0);
    // But now we warn about it instead of silently discarding
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/Bad response/i);
  });

  it('warns when Request has no method match (invalid method)', () => {
    const md = `# API\n\n## Bad method\n\n**Request** → \`INVALID /v1/test\`\n\n**Response** → \`🟢 200 OK\`\n`;
    const { warnings } = parseMarkdownSpec(md) as any;
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('no warnings when all sections have valid steps', () => {
    const md = `# API\n\n## A\n\n**Request** → \`GET /v1/a\`\n\n**Response** → \`🟢 200 OK\`\n\n## B\n\n**Request** → \`GET /v1/b\`\n\n**Response** → \`🟢 200 OK\`\n`;
    const { warnings } = parseMarkdownSpec(md) as any;
    expect(warnings).toHaveLength(0);
  });
});

describe('parser edge cases', () => {
  it('handles empty input', () => {
    expect(parseMarkdownSpec('').tests).toEqual([]);
  });

  it('handles input with only a title and no tests', () => {
    expect(parseMarkdownSpec('# My API\n\nSome intro text.\n').tests).toEqual([]);
  });

  it('handles ## heading with no request/response pairs', () => {
    const md = `# API

## Just a section heading

Some text but no request or response blocks.
`;
    expect(parseMarkdownSpec(md).tests).toEqual([]);
  });

  it('handles multiple ## headings, only some with request/response', () => {
    const md = `# API

## Introduction

Just docs, no test.

## Actual test

**Request** → \`GET /v1/ping\`

**Response** → \`🟢 200 OK\`

## Another non-test section

More docs here.
`;
    const { tests } = parseMarkdownSpec(md);
    expect(tests).toHaveLength(1);
    expect(tests[0].name).toBe('Actual test');
  });

  it('handles request line with no method match', () => {
    const md = `# API

## Bad request

**Request** → \`INVALID /v1/test\`

**Response** → \`🟢 200 OK\`
`;
    const { tests } = parseMarkdownSpec(md);
    expect(tests).toEqual([]);
  });

  it('handles response line with no status code', () => {
    const md = `# API

## Bad response

**Request** → \`GET /v1/test\`

**Response** → \`OK\`
`;
    const { tests } = parseMarkdownSpec(md);
    expect(tests).toEqual([]);
  });

  it('handles PATCH method', () => {
    const md = `# API

## Patch test

**Request** → \`PATCH /v1/users/123\`

\`\`\`json
{"name": "Updated"}
\`\`\`

**Response** → \`🟢 200 OK\`
`;
    const { tests } = parseMarkdownSpec(md);
    expect(tests[0].steps[0].method).toBe('PATCH');
  });

  it('handles PUT method', () => {
    const md = `# API

## Put test

**Request** → \`PUT /v1/users/123\`

\`\`\`json
{"name": "Replaced"}
\`\`\`

**Response** → \`🟢 200 OK\`
`;
    const { tests } = parseMarkdownSpec(md);
    expect(tests[0].steps[0].method).toBe('PUT');
  });

  it('handles paths with query parameters', () => {
    const md = `# API

## Query params

**Request** → \`GET /v1/users?page=1&limit=10\`

**Response** → \`🟢 200 OK\`
`;
    const { tests } = parseMarkdownSpec(md);
    expect(tests[0].steps[0].path).toBe('/v1/users?page=1&limit=10');
  });

  it('handles paths with fragments', () => {
    const md = `# API

## Fragment

**Request** → \`GET /v1/docs#section-2\`

**Response** → \`🟢 200 OK\`
`;
    const { tests } = parseMarkdownSpec(md);
    expect(tests[0].steps[0].path).toBe('/v1/docs#section-2');
  });

  it('handles deeply nested JSON response', () => {
    const md = `# API

## Nested

**Request** → \`GET /v1/nested\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{
  "user": {
    "profile": {
      "name": "Sarah",
      "age": 30
    }
  }
}
\`\`\`
`;
    const { tests } = parseMarkdownSpec(md);
    expect(tests[0].steps[0].response).toEqual({
      user: { profile: { name: 'Sarah', age: 30 } },
    });
  });

  it('handles array in JSON response', () => {
    const md = `# API

## Array

**Request** → \`GET /v1/items\`

**Response** → \`🟢 200 OK\`

\`\`\`json
[
  {"id": "1", "name": "First"},
  {"id": "2", "name": "Second"}
]
\`\`\`
`;
    const { tests } = parseMarkdownSpec(md);
    expect(tests[0].steps[0].response).toEqual([
      { id: '1', name: 'First' },
      { id: '2', name: 'Second' },
    ]);
  });

  it('handles empty JSON body {}', () => {
    const md = `# API

## Empty body

**Request** → \`POST /v1/empty\`

\`\`\`json
{}
\`\`\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{}
\`\`\`
`;
    const { tests } = parseMarkdownSpec(md);
    expect(tests[0].steps[0].body).toEqual({});
    expect(tests[0].steps[0].response).toEqual({});
  });

  it('handles multiple headers blocks (each applies to next step only)', () => {
    const md = `# API

## Multi-header test

**Headers**

\`\`\`http
Authorization: Bearer key_a
\`\`\`

**Request** → \`GET /v1/a\`

**Response** → \`🟢 200 OK\`

**Headers**

\`\`\`http
Authorization: Bearer key_b
\`\`\`

**Request** → \`GET /v1/b\`

**Response** → \`🟢 200 OK\`
`;
    const { tests } = parseMarkdownSpec(md);
    expect(tests[0].steps).toHaveLength(2);
    expect(tests[0].steps[0].headers['Authorization']).toBe('Bearer key_a');
    expect(tests[0].steps[1].headers['Authorization']).toBe('Bearer key_b');
  });

  it('resets headers after each step', () => {
    const md = `# API

## Header reset

**Headers**

\`\`\`http
X-Custom: first
\`\`\`

**Request** → \`GET /v1/a\`

**Response** → \`🟢 200 OK\`

**Request** → \`GET /v1/b\`

**Response** → \`🟢 200 OK\`
`;
    const { tests } = parseMarkdownSpec(md);
    expect(tests[0].steps[0].headers['X-Custom']).toBe('first');
    expect(tests[0].steps[1].headers['X-Custom']).toBeUndefined();
  });

  it('handles header with colon in value (e.g. Bearer token)', () => {
    const md = `# API

## Colon in header

**Headers**

\`\`\`http
Authorization: Bearer abc:def:ghi
\`\`\`

**Request** → \`GET /v1/test\`

**Response** → \`🟢 200 OK\`
`;
    const { tests } = parseMarkdownSpec(md);
    expect(tests[0].steps[0].headers['Authorization']).toBe('Bearer abc:def:ghi');
  });

  it('handles various status codes', () => {
    const codes = [
      { md: '🟢 200 OK', expected: 200 },
      { md: '🟢 201 Created', expected: 201 },
      { md: '🟢 204 No Content', expected: 204 },
      { md: '🔴 400 Bad Request', expected: 400 },
      { md: '🔴 401 Unauthorized', expected: 401 },
      { md: '🔴 403 Forbidden', expected: 403 },
      { md: '🔴 404 Not Found', expected: 404 },
      { md: '🔴 409 Conflict', expected: 409 },
      { md: '🟡 301 Moved', expected: 301 },
      { md: '🔴 500 Internal Server Error', expected: 500 },
      { md: '🔴 502 Bad Gateway', expected: 502 },
      { md: '🔴 503 Service Unavailable', expected: 503 },
    ];
    for (const { md: statusLine, expected } of codes) {
      const fullMd = `# API\n\n## Test ${expected}\n\n**Request** → \`GET /v1/test\`\n\n**Response** → \`${statusLine}\`\n`;
      const { tests } = parseMarkdownSpec(fullMd);
      expect(tests[0].steps[0].status).toBe(expected);
    }
  });

  it('handles markdown with CRLF line endings', () => {
    const md = '# API\r\n\r\n## CRLF test\r\n\r\n**Request** → `GET /v1/test`\r\n\r\n**Response** → `🟢 200 OK`\r\n';
    const { tests } = parseMarkdownSpec(md);
    expect(tests).toHaveLength(1);
    expect(tests[0].steps[0].method).toBe('GET');
  });

  it('handles leading/trailing whitespace in test names', () => {
    const md = `# API

##   Spaced test name

**Request** → \`GET /v1/test\`

**Response** → \`🟢 200 OK\`
`;
    const { tests } = parseMarkdownSpec(md);
    expect(tests[0].name).toBe('Spaced test name');
  });

  it('handles --- horizontal rules between tests', () => {
    const md = `# API

## Test A

**Request** → \`GET /v1/a\`

**Response** → \`🟢 200 OK\`

---

## Test B

**Request** → \`GET /v1/b\`

**Response** → \`🟢 200 OK\`
`;
    const { tests } = parseMarkdownSpec(md);
    expect(tests).toHaveLength(2);
  });

  it('handles three chained steps', () => {
    const md = `# API

## Three steps

**Request** → \`POST /v1/a\`

\`\`\`json
{"n": 1}
\`\`\`

**Response** → \`🟢 200 OK\`

**Request** → \`POST /v1/b\`

\`\`\`json
{"n": 2}
\`\`\`

**Response** → \`🟢 200 OK\`

**Request** → \`POST /v1/c\`

\`\`\`json
{"n": 3}
\`\`\`

**Response** → \`🟢 200 OK\`
`;
    const { tests } = parseMarkdownSpec(md);
    expect(tests[0].steps).toHaveLength(3);
  });

  it('handles JSON with null values', () => {
    const md = `# API

## Null value

**Request** → \`POST /v1/test\`

\`\`\`json
{"key": null}
\`\`\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{"result": null}
\`\`\`
`;
    const { tests } = parseMarkdownSpec(md);
    expect(tests[0].steps[0].body).toEqual({ key: null });
    expect(tests[0].steps[0].response).toEqual({ result: null });
  });

  it('handles JSON with boolean and numeric values', () => {
    const md = `# API

## Mixed types

**Request** → \`POST /v1/test\`

\`\`\`json
{
  "active": true,
  "count": 42,
  "ratio": 3.14,
  "disabled": false
}
\`\`\`

**Response** → \`🟢 200 OK\`
`;
    const { tests } = parseMarkdownSpec(md);
    const body = tests[0].steps[0].body;
    expect(body.active).toBe(true);
    expect(body.count).toBe(42);
    expect(body.ratio).toBe(3.14);
    expect(body.disabled).toBe(false);
  });

  it('handles multiple annotations on different fields', () => {
    const md = `# API

## Multi annotations

**Request** → \`POST /v1/events\`

\`\`\`json
{"event": "test"}
\`\`\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{
  "event_id": "evt_xxxxxxxxxxxx",  // save as: $eid
  "status": "received",  // one of: received, processing
  "key": "WARNING_xxxxxxxxxxxx",  // not: $prev_key
  "mode": "test"
}
\`\`\`
`;
    const { tests } = parseMarkdownSpec(md);
    const ann = tests[0].steps[0].responseAnnotations;
    expect(ann['event_id']).toBe('save as: $eid');
    expect(ann['status']).toBe('one of: received, processing');
    expect(ann['key']).toBe('not: $prev_key');
    expect(ann['mode']).toBeUndefined(); // no annotation
  });

  it('handles request body with length annotation', () => {
    const md = `# API

## Length body

**Request** → \`POST /v1/test\`

\`\`\`json
{
  "long_key": "xxxxxxxxxxxx",  // length: 500
  "normal": "hello"
}
\`\`\`

**Response** → \`🟢 200 OK\`
`;
    const { tests } = parseMarkdownSpec(md);
    expect(tests[0].steps[0].body.long_key).toBe('x'.repeat(500));
    expect(tests[0].steps[0].body.normal).toBe('hello');
  });

  it('handles empty json code block', () => {
    const md = `# API

## Empty block

**Request** → \`POST /v1/test\`

\`\`\`json
\`\`\`

**Response** → \`🟢 200 OK\`
`;
    const { tests } = parseMarkdownSpec(md);
    // Empty JSON block should be treated as null body
    expect(tests[0].steps[0].body).toBeNull();
  });
});

// ── CRLF and trailing spaces robustness (audit) ──

describe('parser — CRLF line endings and trailing whitespace', () => {
  it('parses a spec file with CRLF line endings without dropping the step', () => {
    // Simulate a Windows file: every line ending is \r\n
    const md = '# API\r\n\r\n## Get users\r\n\r\n**Request** → `GET /v1/users`\r\n\r\n**Response** → `🟢 200 OK`\r\n';
    const { tests, warnings } = parseMarkdownSpec(md);
    expect(tests).toHaveLength(1);
    expect(tests[0].name).toBe('Get users');
    expect(tests[0].steps).toHaveLength(1);
    expect(warnings).toHaveLength(0);
  });

  it('CRLF: parses method and path correctly (no \\r in path)', () => {
    const md = '# API\r\n\r\n## Test\r\n\r\n**Request** → `GET /v1/ping`\r\n\r\n**Response** → `🟢 200 OK`\r\n';
    const { tests } = parseMarkdownSpec(md);
    expect(tests[0].steps[0].method).toBe('GET');
    expect(tests[0].steps[0].path).toBe('/v1/ping'); // no trailing \r
  });

  it('trailing spaces after closing backtick on Request line does not drop the step', () => {
    // Real files from some editors add trailing spaces
    const md = '# API\n\n## Test\n\n**Request** → `GET /v1/ping`   \n\n**Response** → `🟢 200 OK`\n';
    const { tests, warnings } = parseMarkdownSpec(md);
    expect(tests).toHaveLength(1);
    expect(tests[0].steps).toHaveLength(1);
    expect(warnings).toHaveLength(0);
  });

  it('CRLF: multi-step spec parses all steps', () => {
    const md = [
      '# API',
      '',
      '## Chain',
      '',
      '**Request** → `POST /v1/items`',
      '',
      '```json',
      '{"name": "test"}',
      '```',
      '',
      '**Response** → `🟢 201 Created`',
      '',
      '**Request** → `GET /v1/items`',
      '',
      '**Response** → `🟢 200 OK`',
    ].join('\r\n');
    const { tests } = parseMarkdownSpec(md);
    expect(tests[0].steps).toHaveLength(2);
    expect(tests[0].steps[0].method).toBe('POST');
    expect(tests[0].steps[1].method).toBe('GET');
  });
});
