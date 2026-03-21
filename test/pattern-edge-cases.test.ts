import { describe, it, expect } from 'vitest';
import { toPattern, matchesPattern } from '../src/pattern.js';

describe('toPattern edge cases', () => {
  it('handles pattern at start of string', () => {
    const re = toPattern('xxxx_suffix');
    expect(re.test('ab12_suffix')).toBe(true);
    expect(re.test('a1_suffix')).toBe(false);
  });

  it('handles pattern at end of string', () => {
    const re = toPattern('prefix_xxxx');
    expect(re.test('prefix_ab12')).toBe(true);
    expect(re.test('prefix_a')).toBe(false);
  });

  it('handles pattern in middle of string', () => {
    const re = toPattern('pre_xxxx_suf');
    expect(re.test('pre_ab12_suf')).toBe(true);
    expect(re.test('pre_a_suf')).toBe(false);
  });

  it('handles overlapping patterns (xx then 00)', () => {
    const re = toPattern('id_xxxx_0000');
    expect(re.test('id_ab12_5678')).toBe(true);
    expect(re.test('id_ab12_abcd')).toBe(false); // 00 part needs digits
  });

  it('handles very long pattern', () => {
    const pattern = 'x'.repeat(100);
    const re = toPattern(pattern);
    expect(re.test('a'.repeat(100))).toBe(true);
    expect(re.test('a'.repeat(99))).toBe(false);
    expect(re.test('a'.repeat(101))).toBe(false);
  });

  it('handles pattern with hyphens (allowed in alphanumeric)', () => {
    const re = toPattern('xxxx');
    expect(re.test('a-b1')).toBe(true);
    expect(re.test('ab-1')).toBe(true);
  });

  it('handles pattern with underscores (allowed in alphanumeric)', () => {
    const re = toPattern('xxxx');
    expect(re.test('a_b1')).toBe(true);
  });

  it('handles numeric pattern with decimal point in literal', () => {
    const re = toPattern('v0.0.0');
    // The 0s are single so not treated as pattern
    expect(re.test('v0.0.0')).toBe(true);
    expect(re.test('v1.2.3')).toBe(false);
  });

  it('handles multiple separate pattern groups', () => {
    const re = toPattern('xx-00-xx');
    expect(re.test('ab-12-cd')).toBe(true);
    expect(re.test('ab-ab-cd')).toBe(false); // middle needs digits
  });

  it('escapes regex special characters in literals', () => {
    const re = toPattern('name.(test)');
    expect(re.test('name.(test)')).toBe(true);
    expect(re.test('nameXXtest)')).toBe(false);
  });

  it('handles empty string', () => {
    const re = toPattern('');
    expect(re.test('')).toBe(true);
    expect(re.test('anything')).toBe(false);
  });
});

describe('matchesPattern edge cases', () => {
  it('any- prefix with various suffixes', () => {
    expect(matchesPattern('any-error', 'Something')).toBe(true);
    expect(matchesPattern('any-value', 'X')).toBe(true);
    expect(matchesPattern('any-thing', '')).toBe(false);
  });

  it('literal match is case-sensitive', () => {
    expect(matchesPattern('received', 'Received')).toBe(false);
    expect(matchesPattern('received', 'received')).toBe(true);
  });

  it('email pattern accepts various valid emails', () => {
    expect(matchesPattern('example@example.com', 'user@domain.com')).toBe(true);
    expect(matchesPattern('example@example.com', 'user+tag@sub.domain.co.uk')).toBe(true);
    expect(matchesPattern('example@example.com', 'a@b.c')).toBe(true);
  });

  it('email pattern rejects invalid emails', () => {
    expect(matchesPattern('example@example.com', 'nodomain')).toBe(false);
    expect(matchesPattern('example@example.com', '@no-local.com')).toBe(false);
    expect(matchesPattern('example@example.com', 'spaces here@test.com')).toBe(false);
  });

  it('does not treat single 0 as numeric pattern', () => {
    expect(matchesPattern('0', '0')).toBe(true);
    expect(matchesPattern('0', '5')).toBe(false);
  });

  it('handles strings that look like patterns but are literals', () => {
    // "x" alone is a literal, not a pattern
    expect(matchesPattern('x', 'x')).toBe(true);
    expect(matchesPattern('x', 'a')).toBe(false);
  });

  it('handles numeric actual value matched against string pattern', () => {
    // When actual is not a string, matchesPattern should handle gracefully
    expect(matchesPattern('00000', '12345')).toBe(true);
  });
});
