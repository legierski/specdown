/**
 * SQL mode tests — **Query** / **Result** keyword pair.
 *
 * Tests parser recognition of Query/Result and runner execution via sqlite3 CLI.
 * RED tests: parser and runner don't support SQL mode yet.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { parseMarkdownSpec } from '../src/parser.js';
import { runSpec } from '../src/runner.js';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { SpecConfig } from '../src/config.js';

// ──────────────────────────────────────
// Test fixture: temp SQLite database
// ──────────────────────────────────────

let tmpDir: string;
let dbPath: string;

function config(): SpecConfig {
  return {
    http: { base: 'http://localhost:1', headers: {} },
    sql: { database: dbPath },
  };
}

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'specdown-sql-'));
  dbPath = join(tmpDir, 'test.db');
  execSync(`sqlite3 "${dbPath}" "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, status TEXT DEFAULT 'active'); INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com'); INSERT INTO users (name, email) VALUES ('Bob', 'bob@example.com');"`);
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ──────────────────────────────────────
// Parser: recognizing **Query** / **Result**
// ──────────────────────────────────────

describe('parser — SQL mode', () => {
  it('parses inline Query with Result row count', () => {
    const md = `# SQL Tests

## Find user

**Query** → \`SELECT * FROM users WHERE name = 'Alice'\`

**Result** → \`🟢 1 row\`

\`\`\`json
{
  "name": "Alice",
  "email": "alice@example.com"
}
\`\`\`
`;
    const { tests, warnings } = parseMarkdownSpec(md);
    expect(warnings).toEqual([]);
    expect(tests).toHaveLength(1);
    expect(tests[0].steps).toHaveLength(1);
    const step = tests[0].steps[0];
    expect(step.mode).toBe('sql');
    expect((step as any).query).toBe("SELECT * FROM users WHERE name = 'Alice'");
    expect((step as any).expectedRows).toBe(1);
    expect((step as any).expectedType).toBe('rows');
  });

  it('parses code block Query', () => {
    const md = `# SQL Tests

## Multi-line query

**Query** ↓

\`\`\`sql
SELECT u.name, COUNT(*) as total
FROM users u
GROUP BY u.name
\`\`\`

**Result** → \`🟢 2 rows\`
`;
    const { tests, warnings } = parseMarkdownSpec(md);
    expect(warnings).toEqual([]);
    expect(tests).toHaveLength(1);
    const step = tests[0].steps[0];
    expect(step.mode).toBe('sql');
    expect((step as any).query).toContain('SELECT u.name');
    expect((step as any).expectedRows).toBe(2);
  });

  it('parses affected count for write operations', () => {
    const md = `# SQL Tests

## Insert user

**Query** → \`INSERT INTO users (name, email) VALUES ('New', 'new@test.com')\`

**Result** → \`🟢 1 affected\`
`;
    const { tests } = parseMarkdownSpec(md);
    expect(tests).toHaveLength(1);
    const step = tests[0].steps[0];
    expect(step.mode).toBe('sql');
    expect((step as any).expectedRows).toBe(1);
    expect((step as any).expectedType).toBe('affected');
  });

  it('parses Result with no count (no arrow)', () => {
    const md = `# SQL Tests

## No count check

**Query** → \`SELECT 1\`

**Result**
`;
    const { tests } = parseMarkdownSpec(md);
    expect(tests).toHaveLength(1);
    const step = tests[0].steps[0];
    expect(step.mode).toBe('sql');
    expect((step as any).expectedRows).toBeNull();
    expect((step as any).expectedType).toBeNull();
  });

  it('parses empty result set', () => {
    const md = `# SQL Tests

## No results

**Query** → \`SELECT * FROM users WHERE name = 'Nobody'\`

**Result** → \`🟢 0 rows\`

\`\`\`json
[]
\`\`\`
`;
    const { tests } = parseMarkdownSpec(md);
    expect(tests).toHaveLength(1);
    const step = tests[0].steps[0];
    expect(step.mode).toBe('sql');
    expect((step as any).expectedRows).toBe(0);
    expect((step as any).expectedResult).toEqual([]);
  });
});

// ──────────────────────────────────────
// Runner: executing SQL steps
// ──────────────────────────────────────

describe('runner — SQL mode', () => {
  it('runs a SELECT and matches row count', async () => {
    const md = `# SQL Tests

## Count users

**Query** → \`SELECT * FROM users\`

**Result** → \`🟢 2 rows\`
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('matches JSON output from SELECT', async () => {
    const md = `# SQL Tests

## Find Alice

**Query** → \`SELECT name, email FROM users WHERE name = 'Alice'\`

**Result** → \`🟢 1 row\`

\`\`\`json
{
  "name": "Alice",
  "email": "alice@example.com"
}
\`\`\`
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1);
  });

  it('fails on row count mismatch', async () => {
    const md = `# SQL Tests

## Wrong count

**Query** → \`SELECT * FROM users\`

**Result** → \`🟢 5 rows\`
`;
    const result = await runSpec(md, config());
    expect(result.failed).toBe(1);
    expect(result.tests[0].errors[0]).toContain('row');
  });

  it('handles INSERT with affected count', async () => {
    const md = `# SQL Tests

## Insert user

**Query** → \`INSERT INTO users (name, email) VALUES ('Charlie', 'charlie@test.com')\`

**Result** → \`🟢 1 affected\`
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1);
  });

  it('returns empty array for zero results', async () => {
    const md = `# SQL Tests

## Nobody

**Query** → \`SELECT * FROM users WHERE name = 'Nobody'\`

**Result** → \`🟢 0 rows\`

\`\`\`json
[]
\`\`\`
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1);
  });

  it('fails when database path is missing', async () => {
    const md = `# SQL Tests

## No DB

**Query** → \`SELECT 1\`

**Result** → \`🟢 1 row\`
`;
    const result = await runSpec(md, {
      http: { base: 'http://localhost:1', headers: {} },
    });
    expect(result.failed).toBe(1);
    expect(result.tests[0].errors[0]).toContain('database');
  });

  it('substitutes variables in queries', async () => {
    const md = `# SQL Tests

## Variable in query

**Query** → \`SELECT name, email FROM users WHERE name = 'Alice'\`

**Result** → \`🟢 1 row\`

\`\`\`json
{
  "name": "any-text",  // save as: $user_name
  "email": "any-text"
}
\`\`\`

**Query** → \`SELECT email FROM users WHERE name = '$user_name'\`

**Result** → \`🟢 1 row\`

\`\`\`json
{
  "email": "alice@example.com"
}
\`\`\`
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1);
  });

  it('fails when sqlite3 database does not exist', async () => {
    const md = `# SQL Tests

## Bad DB

**Query** → \`SELECT 1\`

**Result** → \`🟢 1 row\`
`;
    const result = await runSpec(md, {
      http: { base: 'http://localhost:1', headers: {} },
      sql: { database: '/nonexistent/path/to/db.sqlite' },
    });
    expect(result.failed).toBe(1);
  });
});
