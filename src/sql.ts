/**
 * SQL step executor for specdown.
 *
 * Runs queries via the sqlite3 CLI, piping queries through stdin
 * to prevent shell injection. Captures JSON output for SELECT,
 * and affected row count for write operations.
 */

import { execFileSync } from 'node:child_process';

export interface SqlResult {
  rows: any[];
  changes: number;
  error: string | null;
}

/**
 * Execute a SQL query against a SQLite database via the sqlite3 CLI.
 *
 * Queries are piped through stdin (not passed as arguments) to prevent
 * shell injection from variable-substituted values.
 *
 * @param database - Path to the SQLite database file
 * @param query - SQL query to execute
 * @param type - 'rows' for SELECT (uses -json), 'affected' for INSERT/UPDATE/DELETE
 */
export function execSql(database: string, query: string, type: 'rows' | 'affected' | null, timeout?: number): SqlResult {
  const isWrite = type === 'affected';

  const timeoutOpt = timeout && timeout > 0 ? timeout : undefined;

  try {
    if (isWrite) {
      // For write ops: execute query, then SELECT changes()
      const fullQuery = `${query};\nSELECT changes() as affected;`;
      const stdout = execFileSync('sqlite3', ['-json', database], {
        input: fullQuery,
        encoding: 'utf-8',
        timeout: timeoutOpt,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      let changes = 0;
      if (stdout) {
        try {
          const parsed = JSON.parse(stdout);
          if (Array.isArray(parsed) && parsed.length > 0) {
            changes = parsed[0].affected ?? 0;
          }
        } catch {
          // changes() output not parseable — leave at 0
        }
      }
      return { rows: [], changes, error: null };
    } else {
      // For SELECT: use -json mode
      const stdout = execFileSync('sqlite3', ['-json', database], {
        input: query,
        encoding: 'utf-8',
        timeout: timeoutOpt,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      if (!stdout) return { rows: [], changes: 0, error: null };

      const rows = JSON.parse(stdout);
      return { rows: Array.isArray(rows) ? rows : [rows], changes: 0, error: null };
    }
  } catch (err: any) {
    if (err.killed || err.signal === 'SIGTERM') {
      return { rows: [], changes: 0, error: `Query timed out after ${timeout}ms` };
    }
    const stderr = (err.stderr ?? '').trim();
    const msg = stderr || err.message || 'sqlite3 query failed';
    return { rows: [], changes: 0, error: msg };
  }
}
