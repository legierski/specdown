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

// ── printPrettyResult — step context (v0.6) ──

describe('printPrettyResult — failedStep context', () => {
  afterEach(() => vi.restoreAllMocks());

  function makeStepResult(failedStep?: Record<string, any>): SpecResult {
    return {
      tests: [{
        name: 'Test foo',
        passed: false,
        errors: ['Expected status 200, got 404'],
        duration: 42,
        ...(failedStep !== undefined ? { failedStep } : {}),
      } as any],
      passed: 0,
      failed: 1,
      skipped: 0,
      duration: 42,
      warnings: [],
    } as any;
  }

  it('passing test does not show step context lines', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printPrettyResult('/f.spec.md', {
      tests: [{ name: 'Pass', passed: true, errors: [], duration: 5 } as any],
      passed: 1, failed: 0, skipped: 0, duration: 5, warnings: [],
    } as any);
    const output = spy.mock.calls.map(c => c[0]).join('\n');
    expect(output).not.toContain('Step');
    expect(output).not.toContain('Response:');
  });

  it('failing test with no failedStep shows no step context', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printPrettyResult('/f.spec.md', makeStepResult(undefined));
    const output = spy.mock.calls.map(c => c[0]).join('\n');
    expect(output).not.toContain('Step');
    expect(output).not.toContain('Response:');
  });

  it('failing test with failedStep shows Step N/M: METHOD path', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printPrettyResult('/f.spec.md', makeStepResult({
      stepIndex: 0, stepCount: 1, method: 'GET', path: '/v1/test', status: 404, actualBody: null,
    }));
    const output = spy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('Step 1/1: GET /v1/test');
  });

  it('failing test with failedStep shows Response: status', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printPrettyResult('/f.spec.md', makeStepResult({
      stepIndex: 0, stepCount: 1, method: 'GET', path: '/v1/test', status: 404, actualBody: null,
    }));
    const output = spy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('Response: 404');
  });

  it('shows Step 2/3 for multi-step failure at stepIndex 1', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printPrettyResult('/f.spec.md', makeStepResult({
      stepIndex: 1, stepCount: 3, method: 'POST', path: '/v1/users', status: 500, actualBody: null,
    }));
    const output = spy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('Step 2/3: POST /v1/users');
  });

  it('does NOT show body by default when JSON > 200 chars', () => {
    const largeBody = { message: 'x'.repeat(300) };
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printPrettyResult('/f.spec.md', makeStepResult({
      stepIndex: 0, stepCount: 1, method: 'GET', path: '/v1/test', status: 200, actualBody: largeBody,
    }));
    const output = spy.mock.calls.map(c => c[0]).join('\n');
    expect(output).not.toContain('message');
  });

  it('shows body when verbose=true even for large response', () => {
    const largeBody = { message: 'x'.repeat(300) };
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    (printPrettyResult as any)('/f.spec.md', makeStepResult({
      stepIndex: 0, stepCount: 1, method: 'GET', path: '/v1/test', status: 200, actualBody: largeBody,
    }), true);
    const output = spy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('message');
  });

  it('shows body automatically when JSON <= 200 chars (no verbose needed)', () => {
    const smallBody = { ok: true, id: 'abc' };
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printPrettyResult('/f.spec.md', makeStepResult({
      stepIndex: 0, stepCount: 1, method: 'GET', path: '/v1/test', status: 200, actualBody: smallBody,
    }));
    const output = spy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('"id"');
  });

  it('does not show body when actualBody is null even with verbose', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    (printPrettyResult as any)('/f.spec.md', makeStepResult({
      stepIndex: 0, stepCount: 1, method: 'GET', path: '/v1/test', status: 404, actualBody: null,
    }), true);
    const output = spy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('Step 1/1');
    expect(output).not.toContain('{');
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
