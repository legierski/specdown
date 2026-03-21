/**
 * CLI step executor for specdown.
 *
 * Runs shell commands via child_process.execSync and captures
 * stdout, stderr, and exit code. Used by the runner for CLI mode steps.
 */

import { execSync } from 'node:child_process';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Execute a shell command synchronously.
 *
 * @param command - Shell command to run
 * @param timeout - Timeout in ms (0 or undefined = no timeout)
 * @param shell - Shell executable to use (e.g. '/bin/bash'). Defaults to system shell.
 * @returns stdout, stderr, and exit code
 */
export function execCommand(command: string, timeout?: number, shell?: string): ExecResult {
  try {
    const stdout = execSync(command, {
      encoding: 'utf-8',
      timeout: timeout && timeout > 0 ? timeout : undefined,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...(shell ? { shell } : {}),
    });
    return { stdout: stdout.trimEnd(), stderr: '', exitCode: 0 };
  } catch (err: any) {
    if (err.killed || err.signal === 'SIGTERM') {
      // Timeout — execSync kills the process
      return {
        stdout: (err.stdout ?? '').trimEnd(),
        stderr: `Command timed out after ${timeout}ms`,
        exitCode: -1,
      };
    }
    return {
      stdout: (err.stdout ?? '').trimEnd(),
      stderr: (err.stderr ?? '').trimEnd(),
      exitCode: err.status ?? 1,
    };
  }
}
