import { describe, it, expect } from 'vitest';
import { matchResponse, substituteVars } from '../src/matcher.js';

describe('matchResponse edge cases', () => {
  it('handles nested object matching', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { user: { name: 'Sarah', age: 30 } },
      { user: { name: 'Sarah', age: 30 } },
      {},
      vars
    );
    expect(errors).toEqual([]);
  });

  it('reports nested object mismatch', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { user: { name: 'Sarah' } },
      { user: { name: 'John' } },
      {},
      vars
    );
    expect(errors).toHaveLength(1);
  });

  it('handles null in expected matching null in actual', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { field: null },
      { field: null },
      {},
      vars
    );
    expect(errors).toEqual([]);
  });

  it('handles null in expected but non-null in actual', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { field: 'value' },
      { field: null },
      {},
      vars
    );
    expect(errors).toHaveLength(1);
  });

  it('handles type mismatch (expected string, got number)', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { count: 42 },
      { count: '42' },
      {},
      vars
    );
    expect(errors).toHaveLength(1);
  });

  it('handles empty object expected', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { anything: 'here' },
      {},
      {},
      vars
    );
    expect(errors).toEqual([]);
  });

  it('handles multiple save as in same response', () => {
    const vars: Record<string, string> = {};
    matchResponse(
      { id: 'abc', token: 'xyz' },
      { id: 'xxx', token: 'xxx' },
      { id: 'save as: $id', token: 'save as: $token' },
      vars
    );
    expect(vars.id).toBe('abc');
    expect(vars.token).toBe('xyz');
  });

  it('handles $variable that resolves to empty string', () => {
    const vars = { empty: '' };
    const errors = matchResponse(
      { field: '' },
      { field: '$empty' },
      {},
      vars
    );
    expect(errors).toEqual([]);
  });

  it('handles $variable reference to unset variable (treated as literal)', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { field: '$unset' },
      { field: '$unset' },
      {},
      vars
    );
    // $unset is not in vars, so it falls through to pattern matching
    // "$unset" === "$unset" → exact match
    expect(errors).toEqual([]);
  });

  it('handles actual value being undefined for non-string expected', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      {},
      { count: 5 },
      {},
      vars
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('count');
  });

  it('handles email pattern in response', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { email: 'sarah@test.org' },
      { email: 'example@example.com' },
      {},
      vars
    );
    expect(errors).toEqual([]);
  });

  it('fails email pattern for invalid email', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { email: 'not-an-email' },
      { email: 'example@example.com' },
      {},
      vars
    );
    expect(errors).toHaveLength(1);
  });

  it('handles combined save and pattern validation', () => {
    const vars: Record<string, string> = {};
    // Pattern should match AND value should be saved
    matchResponse(
      { id: 'evt_abc123def456' },
      { id: 'evt_xxxxxxxxxxxx' },
      { id: 'save as: $event_id' },
      vars
    );
    expect(vars.event_id).toBe('evt_abc123def456');
  });

  it('not: annotation with pattern that also fails validation', () => {
    const vars = { prev: 'evt_aaaaaaaaaaaa' };
    const errors = matchResponse(
      { id: 'short' }, // doesn't match evt_xxxxxxxxxxxx pattern
      { id: 'evt_xxxxxxxxxxxx' },
      { id: 'not: $prev' },
      vars
    );
    expect(errors).toHaveLength(1); // pattern fails before not: check
  });

  it('handles many fields with mixed match types', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      {
        success: true,
        event_id: 'evt_abc123def456',
        status: 'received',
        mode: 'test',
        error: null,
        count: 1,
      },
      {
        success: true,
        event_id: 'evt_xxxxxxxxxxxx',
        status: 'any-text',
        mode: 'test',
        error: null,
        count: 1,
      },
      { event_id: 'save as: $eid' },
      vars
    );
    expect(errors).toEqual([]);
    expect(vars.eid).toBe('evt_abc123def456');
  });

  it('handles array values (exact match)', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { tags: ['a', 'b', 'c'] },
      { tags: ['a', 'b', 'c'] },
      {},
      vars
    );
    expect(errors).toEqual([]);
  });

  it('fails on array value mismatch', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { tags: ['a', 'b'] },
      { tags: ['a', 'b', 'c'] },
      {},
      vars
    );
    expect(errors).toHaveLength(1);
  });
});

describe('substituteVars edge cases', () => {
  it('handles empty string input', () => {
    expect(substituteVars('', { a: '1' })).toBe('');
  });

  it('handles string with $ but no valid variable name', () => {
    expect(substituteVars('$', {})).toBe('$');
    expect(substituteVars('$ ', {})).toBe('$ ');
    expect(substituteVars('$123', {})).toBe('$123'); // vars must start with letter or _
  });

  it('handles underscore-prefixed variable names', () => {
    expect(substituteVars('$_private', { _private: 'secret' })).toBe('secret');
  });

  it('handles variable at end of string', () => {
    expect(substituteVars('id=$id', { id: '123' })).toBe('id=123');
  });

  it('handles adjacent variables', () => {
    expect(substituteVars('$a$b', { a: 'X', b: 'Y' })).toBe('XY');
  });

  it('does not double-substitute', () => {
    // If $a resolves to "$b", $b should NOT be resolved
    expect(substituteVars('$a', { a: '$b', b: 'nope' })).toBe('$b');
  });
});

// ──────────────────────────────────────
// Type mismatch error message clarity
// ──────────────────────────────────────

// ──────────────────────────────────────
// BUG: save as: annotation skips exact value validation
// If expected is "active" with save as: $s, and actual is "deleted",
// it saves "deleted" without checking the expected value — false positive.
// ──────────────────────────────────────

describe('matchResponse — save as: should validate then save', () => {
  it('save as: with literal expected should fail when actual differs', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { status: 'deleted' },
      { status: 'active' },
      { status: 'save as: $status' },
      vars
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/status/);
    // Should NOT save the wrong value
    expect(vars.status).toBeUndefined();
  });

  it('save as: with matching literal should save and pass', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { status: 'active' },
      { status: 'active' },
      { status: 'save as: $status' },
      vars
    );
    expect(errors).toHaveLength(0);
    expect(vars.status).toBe('active');
  });

  it('save as: with pattern match failure should not save', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { id: 'short' },
      { id: 'usr_xxxxxxxxxxxx' },
      { id: 'save as: $uid' },
      vars
    );
    expect(errors).toHaveLength(1);
    expect(vars.uid).toBeUndefined();
  });
});

// ──────────────────────────────────────
// BUG: not: with missing variable silently skips annotation
// If $old_token doesn't exist in vars, the not: check is ignored entirely.
// Typo in variable name = silent false positive.
// ──────────────────────────────────────

describe('matchResponse — not: annotation with missing variable', () => {
  it('not: referencing a variable not in vars should error', () => {
    const vars: Record<string, string> = {}; // $old_token not set
    const errors = matchResponse(
      { token: 'abc123' },
      { token: 'xxxxxx' },
      { token: 'not: $old_token' },
      vars
    );
    // Should fail: the referenced variable doesn't exist, so annotation can't be evaluated
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/old_token/);
  });

  it('not: referencing a present variable still works', () => {
    const vars = { old_token: 'aaa111' };
    const errors = matchResponse(
      { token: 'bbb222' },
      { token: 'xxxxxx' },
      { token: 'not: $old_token' },
      vars
    );
    expect(errors).toHaveLength(0);
  });

  it('not: with present variable that matches actual should fail', () => {
    const vars = { old_token: 'same_value' };
    const errors = matchResponse(
      { token: 'same_value' },
      { token: 'xxxxxxxxxx' },
      { token: 'not: $old_token' },
      vars
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/NOT/i);
  });
});

describe('matchResponse — type mismatch error messages', () => {
  it('number actual vs string expected shows raw JSON (not string-coerced)', () => {
    const errors = matchResponse({ id: 42 }, { id: '42' }, {}, {});
    expect(errors).toHaveLength(1);
    // "42" (no quotes) vs "42" (with quotes) — visually distinct
    expect(errors[0]).toMatch(/42[^"]/);   // actual: bare 42
    expect(errors[0]).toMatch(/"42"/);     // expected: quoted "42"
  });

  it('null actual vs string "null" expected shows raw JSON', () => {
    const errors = matchResponse({ value: null }, { value: 'null' }, {}, {});
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/\bnull\b/);   // bare null
    expect(errors[0]).toMatch(/"null"/);     // quoted "null"
  });

  it('boolean true actual vs string "true" expected shows raw JSON', () => {
    const errors = matchResponse({ flag: true }, { flag: 'true' }, {}, {});
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/\btrue\b/);   // bare true
    expect(errors[0]).toMatch(/"true"/);     // quoted "true"
  });

  it('boolean false actual vs string "false" expected shows raw JSON', () => {
    const errors = matchResponse({ flag: false }, { flag: 'false' }, {}, {});
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/\bfalse\b/);  // bare false
    expect(errors[0]).toMatch(/"false"/);    // quoted "false"
  });

  it('string actual vs number expected shows raw JSON', () => {
    const errors = matchResponse({ count: '5' }, { count: 5 }, {}, {});
    expect(errors).toHaveLength(1);
    // actual: "5" (quoted), expected: 5 (bare)
    expect(errors[0]).toMatch(/"5"/);        // actual: quoted "5"
    expect(errors[0]).toMatch(/\b5\b/);      // expected: bare 5
  });
});
