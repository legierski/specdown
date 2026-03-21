import { describe, it, expect } from 'vitest';
import { matchResponse, substituteVars } from '../src/matcher.js';

describe('substituteVars', () => {
  it('replaces $variables with saved values', () => {
    const vars = { user_id: 'usr_abc123' };
    expect(substituteVars('$user_id', vars)).toBe('usr_abc123');
  });

  it('replaces variables in paths', () => {
    const vars = { user_id: 'usr_abc123' };
    expect(substituteVars('/v1/users/$user_id', vars)).toBe('/v1/users/usr_abc123');
  });

  it('leaves unknown variables as-is', () => {
    expect(substituteVars('$unknown', {})).toBe('$unknown');
  });

  it('replaces multiple variables', () => {
    const vars = { a: '1', b: '2' };
    expect(substituteVars('$a and $b', vars)).toBe('1 and 2');
  });

  it('handles strings without variables', () => {
    expect(substituteVars('no vars here', {})).toBe('no vars here');
  });
});

describe('matchResponse', () => {
  it('matches exact values', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { status: 'received', mode: 'test' },
      { status: 'received', mode: 'test' },
      {},
      vars
    );
    expect(errors).toEqual([]);
  });

  it('matches pattern values (xx+)', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { event_id: 'evt_abc123def456' },
      { event_id: 'evt_xxxxxxxxxxxx' },
      {},
      vars
    );
    expect(errors).toEqual([]);
  });

  it('reports mismatch for exact values', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { status: 'failed' },
      { status: 'received' },
      {},
      vars
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('status');
  });

  it('saves variable with "save as: $var" annotation', () => {
    const vars: Record<string, string> = {};
    matchResponse(
      { event_id: 'evt_realvalue123' },
      { event_id: 'evt_xxxxxxxxxxxx' },
      { event_id: 'save as: $event_id' },
      vars
    );
    expect(vars.event_id).toBe('evt_realvalue123');
  });

  it('validates pattern even when saving', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { event_id: 'short' },
      { event_id: 'evt_xxxxxxxxxxxx' },
      { event_id: 'save as: $event_id' },
      vars
    );
    expect(errors).toHaveLength(1);
  });

  it('matches $variable references', () => {
    const vars = { event_id: 'evt_saved123456' };
    const errors = matchResponse(
      { event_id: 'evt_saved123456' },
      { event_id: '$event_id' },
      {},
      vars
    );
    expect(errors).toEqual([]);
  });

  it('fails when $variable does not match', () => {
    const vars = { event_id: 'evt_saved123456' };
    const errors = matchResponse(
      { event_id: 'evt_different000' },
      { event_id: '$event_id' },
      {},
      vars
    );
    expect(errors).toHaveLength(1);
  });

  it('handles "not: $var" annotation — passes when different', () => {
    const vars = { first_id: 'evt_aaaaaaaaaaaa' };
    const errors = matchResponse(
      { event_id: 'evt_bbbbbbbbbbbb' },
      { event_id: 'evt_xxxxxxxxxxxx' },
      { event_id: 'not: $first_id' },
      vars
    );
    expect(errors).toEqual([]);
  });

  it('handles "not: $var" annotation — fails when same', () => {
    const vars = { first_id: 'evt_aaaaaaaaaaaa' };
    const errors = matchResponse(
      { event_id: 'evt_aaaaaaaaaaaa' },
      { event_id: 'evt_xxxxxxxxxxxx' },
      { event_id: 'not: $first_id' },
      vars
    );
    expect(errors).toHaveLength(1);
  });

  it('handles "one of:" annotation', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { mode: 'test' },
      { mode: 'test' },
      { mode: 'one of: test, prod' },
      vars
    );
    expect(errors).toEqual([]);
  });

  it('fails "one of:" when value not in list', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { mode: 'staging' },
      { mode: 'test' },
      { mode: 'one of: test, prod' },
      vars
    );
    expect(errors).toHaveLength(1);
  });

  it('handles any-text pattern', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { error: 'Something went wrong' },
      { error: 'any-text' },
      {},
      vars
    );
    expect(errors).toEqual([]);
  });

  it('fails any-text for empty string', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { error: '' },
      { error: 'any-text' },
      {},
      vars
    );
    expect(errors).toHaveLength(1);
  });

  it('matches numeric values exactly', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { count: 5 },
      { count: 5 },
      {},
      vars
    );
    expect(errors).toEqual([]);
  });

  it('matches boolean values exactly', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { success: true },
      { success: true },
      {},
      vars
    );
    expect(errors).toEqual([]);
  });

  it('only checks fields present in expected (partial matching)', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { id: '1', name: 'Sarah', extra: 'ignored' },
      { id: '1', name: 'Sarah' },
      {},
      vars
    );
    expect(errors).toEqual([]);
  });

  it('reports missing field in actual response', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { id: '1' },
      { id: '1', name: 'Sarah' },
      {},
      vars
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('name');
  });

  it('handles "length:" annotation', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { key: 'a'.repeat(1000) },
      { key: 'xxxxxxxxxxxx' },
      { key: 'length: 1000' },
      vars
    );
    expect(errors).toEqual([]);
  });

  it('fails "length:" annotation when wrong length', () => {
    const vars: Record<string, string> = {};
    const errors = matchResponse(
      { key: 'short' },
      { key: 'xxxxxxxxxxxx' },
      { key: 'length: 1000' },
      vars
    );
    expect(errors).toHaveLength(1);
  });
});
