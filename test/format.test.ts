import { describe, it, expect, vi, afterEach } from 'vitest';
import { green, red, dim, bold, printPrettyResult, printSummary, printJsonResults } from '../src/format.js';
import type { SpecResult } from '../src/runner.js';

// ── ANSI helpers ──

describe('ANSI color helpers', () => {
  it('green wraps string with green ANSI codes', () => {
    expect(green('ok')).toBe('\x1b[32mok\x1b[0m');
  });

  it('red wraps string with red ANSI codes', () => {
    expect(red('fail')).toBe('\x1b[31mfail\x1b[0m');
  });

  it('dim wraps string with dim ANSI codes', () => {
    expect(dim('42ms')).toBe('\x1b[2m42ms\x1b[0m');
  });

  it('bold wraps string with bold ANSI codes', () => {
    expect(bold('Results:')).toBe('\x1b[1mResults:\x1b[0m');
  });

  it('handles empty string', () => {
    expect(green('')).toBe('\x1b[32m\x1b[0m');
  });
});

// ── printPrettyResult ──

describe('printPrettyResult', () => {
  afterEach(() => vi.restoreAllMocks());

  const makeResult = (tests: SpecResult['tests']): SpecResult => ({
    tests,
    passed: tests.filter(t => t.passed).length,
    failed: tests.filter(t => !t.passed).length,
    skipped: 0,
    duration: 0,
  });

  it('prints nothing when result has no tests', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printPrettyResult('/some/file.spec.md', makeResult([]));
    expect(spy).not.toHaveBeenCalled();
  });

  it('prints ✓ for passing test', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printPrettyResult('/cwd/api.spec.md', makeResult([
      { name: 'Create user', passed: true, errors: [], duration: 12 },
    ]));
    const output = spy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('✓');
    expect(output).toContain('Create user');
  });

  it('prints ✗ and errors for failing test', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printPrettyResult('/cwd/api.spec.md', makeResult([
      { name: 'Delete user', passed: false, errors: ['status: 404 !== 200'], duration: 5 },
    ]));
    const output = spy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('✗');
    expect(output).toContain('status: 404 !== 200');
  });
});

// ── printSummary ──

describe('printSummary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('includes passed and failed counts', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printSummary(3, 1, 0, 2);
    const output = spy.mock.calls[0][0];
    expect(output).toContain('3 passed');
    expect(output).toContain('1 failed');
  });

  it('omits skipped when zero', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printSummary(5, 0, 0, 1);
    expect(spy.mock.calls[0][0]).not.toContain('skipped');
  });

  it('includes skipped count when non-zero', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printSummary(2, 0, 3, 1);
    expect(spy.mock.calls[0][0]).toContain('3 skipped');
  });
});

// ── printJsonResults ──

describe('printJsonResults', () => {
  afterEach(() => vi.restoreAllMocks());

  it('outputs valid JSON with files, passed, failed, skipped', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fileResult = {
      file: 'api.spec.md',
      tests: [],
      passed: 2,
      failed: 0,
      skipped: 0,
      duration: 100,
    };
    printJsonResults([fileResult], 2, 0, 0);
    const parsed = JSON.parse(spy.mock.calls[0][0]);
    expect(parsed.passed).toBe(2);
    expect(parsed.failed).toBe(0);
    expect(parsed.files[0].file).toBe('api.spec.md');
  });
});
