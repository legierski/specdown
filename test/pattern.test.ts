import { describe, it, expect } from 'vitest';
import { toPattern, matchesPattern } from '../src/pattern.js';

describe('toPattern', () => {
  it('converts repeated x to alphanumeric regex of exact length', () => {
    const re = toPattern('xxxxxxxxxxxx');
    expect(re.test('abc123def456')).toBe(true);
    expect(re.test('abc123def45')).toBe(false); // too short
    expect(re.test('abc123def4567')).toBe(false); // too long
  });

  it('converts repeated 0 to numeric regex of exact length', () => {
    const re = toPattern('00000');
    expect(re.test('12345')).toBe(true);
    expect(re.test('1234')).toBe(false);
    expect(re.test('abcde')).toBe(false);
  });

  it('handles mixed literal and pattern parts', () => {
    const re = toPattern('evt_xxxxxxxxxxxx');
    expect(re.test('evt_abc123def456')).toBe(true);
    expect(re.test('evt_short')).toBe(false);
    expect(re.test('xxx_abc123def456')).toBe(false);
  });

  it('handles timestamp pattern', () => {
    const re = toPattern('0000-00-00T00:00:00Z');
    expect(re.test('2026-03-21T14:30:00Z')).toBe(true);
    expect(re.test('not-a-timestamp')).toBe(false);
  });

  it('handles WARNING prefix with patterns', () => {
    const re = toPattern('WARNING_evt_xxxxxxxxxxxx_0000000000000');
    expect(re.test('WARNING_evt_abc123def456_1234567890123')).toBe(true);
    expect(re.test('WARNING_evt_short_123')).toBe(false);
  });

  it('preserves literal strings without patterns', () => {
    const re = toPattern('received');
    expect(re.test('received')).toBe(true);
    expect(re.test('processing')).toBe(false);
  });

  it('does not treat single x or 0 as pattern', () => {
    const re = toPattern('x');
    expect(re.test('x')).toBe(true);
    expect(re.test('a')).toBe(false);
  });

  it('handles dots and special regex chars in literals', () => {
    const re = toPattern('user.created');
    expect(re.test('user.created')).toBe(true);
    expect(re.test('userXcreated')).toBe(false);
  });
});

describe('matchesPattern', () => {
  it('returns true for any-text with non-empty strings', () => {
    expect(matchesPattern('any-text', 'hello world')).toBe(true);
    expect(matchesPattern('any-text', '')).toBe(false);
  });

  it('returns true for any-* wildcards with non-empty strings', () => {
    expect(matchesPattern('any-error-message', 'Invalid request')).toBe(true);
    expect(matchesPattern('any-error-message', '')).toBe(false);
  });

  it('uses pattern matching for xx/00 patterns', () => {
    expect(matchesPattern('evt_xxxxxxxxxxxx', 'evt_abc123def456')).toBe(true);
    expect(matchesPattern('evt_xxxxxxxxxxxx', 'evt_short')).toBe(false);
  });

  it('does exact match for plain strings', () => {
    expect(matchesPattern('received', 'received')).toBe(true);
    expect(matchesPattern('received', 'processing')).toBe(false);
  });

  it('matches example@example.com as email pattern', () => {
    expect(matchesPattern('example@example.com', 'sarah@test.org')).toBe(true);
    expect(matchesPattern('example@example.com', 'not-an-email')).toBe(false);
  });
});
