/**
 * Array partial matching tests.
 *
 * Design (approved by Marcus):
 *   - Positional: expected[0] matches actual[0], not "any element"
 *   - Shorter spec is fine: asserting 2 elements of a 10-element array passes
 *   - Spec longer than actual fails: asserting element at index N when actual has < N+1 elements
 *   - Empty spec array []: asserts response is an array, no element checks
 *   - Nested objects inside array elements: partial matching (same rules as top-level)
 *   - Nested arrays: same rules recursively
 */

import { describe, it, expect } from 'vitest';
import { matchResponse } from '../src/matcher.js';

describe('matchResponse — array partial matching', () => {
  it('empty expected array passes when actual is any array', () => {
    const errors = matchResponse([1, 2, 3], [], {}, {});
    expect(errors).toHaveLength(0);
  });

  it('empty expected array fails when actual is not an array', () => {
    const errors = matchResponse({foo: 'bar'}, [], {}, {});
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/array/i);
  });

  it('single element spec partial-matches first element', () => {
    const actual = [{ id: 1, name: 'Alice', extra: 'ignored' }];
    const expected = [{ id: 1, name: 'Alice' }];
    const errors = matchResponse(actual, expected, {}, {});
    expect(errors).toHaveLength(0);
  });

  it('extra fields in actual elements are ignored (partial match)', () => {
    const actual = [
      { id: 1, name: 'Alice', email: 'alice@example.com', role: 'admin' },
    ];
    const expected = [{ id: 1 }];
    const errors = matchResponse(actual, expected, {}, {});
    expect(errors).toHaveLength(0);
  });

  it('spec shorter than actual passes (prefix assertion)', () => {
    const actual = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
      { id: 3, name: 'Carol' },
    ];
    const expected = [{ id: 1 }, { id: 2 }];
    const errors = matchResponse(actual, expected, {}, {});
    expect(errors).toHaveLength(0);
  });

  it('spec longer than actual fails with clear error', () => {
    const actual = [{ id: 1 }];
    const expected = [{ id: 1 }, { id: 2 }];
    const errors = matchResponse(actual, expected, {}, {});
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/expected at least 2/i);
    expect(errors[0]).toMatch(/got 1/i);
  });

  it('element field mismatch reported with index', () => {
    const actual = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];
    const expected = [{ id: 1 }, { id: 99 }];
    const errors = matchResponse(actual, expected, {}, {});
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/\[1\]/);  // index in path
    expect(errors[0]).toMatch(/id/);
  });

  it('missing field in array element reported with index', () => {
    const actual = [{ id: 1 }];
    const expected = [{ id: 1, name: 'Alice' }];
    const errors = matchResponse(actual, expected, {}, {});
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/\[0\]/);
    expect(errors[0]).toMatch(/name/i);
  });

  it('pattern matching works inside array elements', () => {
    const actual = [{ id: 'usr_abc123def456' }];
    const expected = [{ id: 'usr_xxxxxxxxxxxx' }];
    const errors = matchResponse(actual, expected, {}, {});
    expect(errors).toHaveLength(0);
  });

  it('nested object inside array element uses partial matching', () => {
    const actual = [
      { id: 1, address: { city: 'London', postcode: 'SW1A', country: 'UK' } },
    ];
    const expected = [
      { id: 1, address: { city: 'London' } },
    ];
    const errors = matchResponse(actual, expected, {}, {});
    expect(errors).toHaveLength(0);
  });

  it('actual response is not an array → fails', () => {
    const actual = { id: 1, name: 'Alice' };
    const expected = [{ id: 1 }];
    const errors = matchResponse(actual, expected, {}, {});
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/array/i);
  });
});

// ──────────────────────────────────────
// Nested object matching (should recurse, not JSON.stringify)
// ──────────────────────────────────────

describe('matchResponse — nested object partial matching', () => {
  it('nested object: partial match (extra fields ignored)', () => {
    const actual = { user: { id: 1, name: 'Alice', role: 'admin' } };
    const expected = { user: { id: 1, name: 'Alice' } };
    const errors = matchResponse(actual, expected, {}, {});
    expect(errors).toHaveLength(0);
  });

  it('nested object field mismatch reports full path', () => {
    const actual = { user: { id: 1, name: 'Bob' } };
    const expected = { user: { id: 1, name: 'Alice' } };
    const errors = matchResponse(actual, expected, {}, {});
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/user/);
    expect(errors[0]).toMatch(/name/);
  });

  it('nested object: missing field reports path', () => {
    const actual = { user: { id: 1 } };
    const expected = { user: { id: 1, name: 'Alice' } };
    const errors = matchResponse(actual, expected, {}, {});
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/user/);
    expect(errors[0]).toMatch(/name/i);
  });

  it('three levels deep: partial match', () => {
    const actual = { a: { b: { c: 42, extra: 'ignored' } } };
    const expected = { a: { b: { c: 42 } } };
    const errors = matchResponse(actual, expected, {}, {});
    expect(errors).toHaveLength(0);
  });
});

// ──────────────────────────────────────
// BUG: Array of primitives silently passes (false positive)
// Object.entries(primitive) returns [] → no errors generated
// ──────────────────────────────────────

describe('matchResponse — array of primitives (bug: silent pass)', () => {
  it('number mismatch in array should fail', () => {
    // [999] actual vs [1] expected — 999 !== 1
    const errors = matchResponse([999], [1], {}, {});
    expect(errors).toHaveLength(1);
  });

  it('string mismatch in array should fail', () => {
    const errors = matchResponse(['actual'], ['expected'], {}, {});
    expect(errors).toHaveLength(1);
  });

  it('boolean mismatch in array should fail', () => {
    const errors = matchResponse([false], [true], {}, {});
    expect(errors).toHaveLength(1);
  });

  it('matching primitives in array should pass', () => {
    const errors = matchResponse([1, 'hello', true], [1, 'hello', true], {}, {});
    expect(errors).toHaveLength(0);
  });

  it('array of numbers with one wrong element reports error with index', () => {
    const errors = matchResponse([1, 2, 999], [1, 2, 3], {}, {});
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/\[2\]/); // index 2 in the path
  });
});

// ──────────────────────────────────────
// BUG: null in expected array crashes (Object.entries(null) throws)
// ──────────────────────────────────────

describe('matchResponse — null element in expected array (bug: crash)', () => {
  it('null expected matches null actual (no crash)', () => {
    const errors = matchResponse([null], [null], {}, {});
    expect(errors).toHaveLength(0);
  });

  it('null expected does not match non-null actual', () => {
    const errors = matchResponse(['anything'], [null], {}, {});
    expect(errors).toHaveLength(1);
  });

  it('non-null actual matches null expected → should fail, not crash', () => {
    const errors = matchResponse([{ id: 1 }], [null], {}, {});
    expect(errors).toHaveLength(1);
  });
});
