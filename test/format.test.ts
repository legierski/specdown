import { describe, it, expect } from 'vitest';
import { green, red, dim, bold } from '../src/format.js';

describe('format helpers', () => {
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
