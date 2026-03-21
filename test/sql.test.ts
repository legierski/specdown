/**
 * Tests for sql.ts — SQLite query execution via sqlite3 CLI.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSql } from '../src/sql.js';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let tmpDir: string;
let dbPath: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'specdown-sql-unit-'));
  dbPath = join(tmpDir, 'test.db');
  execSync(`sqlite3 "${dbPath}" "CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO items (name) VALUES ('alpha'); INSERT INTO items (name) VALUES ('beta');"`);
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('execSql', () => {
  it('returns rows for SELECT query', () => {
    const result = execSql(dbPath, 'SELECT * FROM items', 'rows');
    expect(result.error).toBeNull();
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].name).toBe('alpha');
  });

  it('returns empty rows for no-match SELECT', () => {
    const result = execSql(dbPath, "SELECT * FROM items WHERE name = 'nobody'", 'rows');
    expect(result.error).toBeNull();
    expect(result.rows).toEqual([]);
  });

  it('returns changes count for INSERT', () => {
    const result = execSql(dbPath, "INSERT INTO items (name) VALUES ('gamma')", 'affected');
    expect(result.error).toBeNull();
    expect(result.changes).toBe(1);
  });

  it('returns error for invalid SQL', () => {
    const result = execSql(dbPath, 'SELECT * FROM nonexistent_table', 'rows');
    expect(result.error).not.toBeNull();
    expect(result.error).toContain('nonexistent_table');
  });

  it('returns error for nonexistent database', () => {
    const result = execSql('/nonexistent/db.sqlite', 'SELECT 1', 'rows');
    expect(result.error).not.toBeNull();
  });

  it('handles query with null type', () => {
    const result = execSql(dbPath, 'SELECT 1 as val', null);
    expect(result.error).toBeNull();
    expect(result.rows).toHaveLength(1);
  });
});
