/**
 * Tests for exec.ts — shell command execution.
 */

import { describe, it, expect } from 'vitest';
import { execCommand } from '../src/exec.js';

describe('execCommand', () => {
  it('runs a successful command and captures stdout', () => {
    const result = execCommand('echo hello');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hello');
    expect(result.stderr).toBe('');
  });

  it('captures non-zero exit code', () => {
    const result = execCommand('cat /file/that/does/not/exist');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).not.toBe('');
  });

  it('captures stderr from failing commands', () => {
    const result = execCommand('cat /file/that/does/not/exist');
    expect(result.stderr).toContain('No such file');
  });

  it('times out long-running commands', () => {
    const result = execCommand('sleep 10', 100);
    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toContain('timed out');
  }, 5000);

  it('handles multi-line output', () => {
    const result = execCommand('echo "line1" && echo "line2"');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('line1\nline2');
  });

  it('returns exit code 1 for false command', () => {
    const result = execCommand('false');
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
  });

  it('uses custom shell when provided', () => {
    // Pass /bin/sh as shell — should work the same for echo
    const result = execCommand('echo shell-test', undefined, '/bin/sh');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('shell-test');
  });

  it('rejects invalid shell path', () => {
    const result = execCommand('echo hello', undefined, '/nonexistent/shell');
    expect(result.exitCode).not.toBe(0);
  });
});
