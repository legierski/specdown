/**
 * Tests for analyzeVarChain — static variable chain validation.
 *
 * Detects $var references in a test's steps that are never satisfied
 * by a `save as: $var` annotation in a prior step of the same test.
 */

import { describe, it, expect } from 'vitest';
import { analyzeVarChain } from '../src/analyze.js';
import type { Test } from '../src/parser.js';

// ── helpers ──

function makeStep(overrides: {
  path?: string;
  body?: any;
  response?: any;
  responseAnnotations?: Record<string, string>;
  bodyAnnotations?: Record<string, string>;
} = {}): Test['steps'][0] {
  return {
    headers: {},
    method: 'GET',
    path: overrides.path ?? '/v1/test',
    body: overrides.body ?? null,
    bodyAnnotations: overrides.bodyAnnotations ?? {},
    status: 200,
    responseHeaders: {},
    response: overrides.response ?? null,
    responseAnnotations: overrides.responseAnnotations ?? {},
  };
}

function makeTest(name: string, steps: Test['steps'][0][]): Test {
  return { name, steps };
}

// ── baseline ──

describe('analyzeVarChain — no warnings cases', () => {
  it('returns empty array for empty tests list', () => {
    expect(analyzeVarChain([])).toEqual([]);
  });

  it('returns no warnings for a test with no variables anywhere', () => {
    const test = makeTest('Simple', [
      makeStep({ path: '/v1/users' }),
      makeStep({ path: '/v1/items' }),
    ]);
    expect(analyzeVarChain([test])).toHaveLength(0);
  });

  it('returns no warnings when step 2 uses $id saved by step 1 in path', () => {
    const test = makeTest('Chain', [
      makeStep({ responseAnnotations: { id: 'save as: $id' } }),
      makeStep({ path: '/v1/users/$id' }),
    ]);
    expect(analyzeVarChain([test])).toHaveLength(0);
  });

  it('returns no warnings when var is defined in step 1 and used in steps 2 and 3', () => {
    const test = makeTest('Multi-use', [
      makeStep({ responseAnnotations: { id: 'save as: $id' } }),
      makeStep({ path: '/v1/a/$id' }),
      makeStep({ path: '/v1/b/$id' }),
    ]);
    expect(analyzeVarChain([test])).toHaveLength(0);
  });

  it('returns no warnings when spec has only saves and no references', () => {
    const test = makeTest('Save only', [
      makeStep({ responseAnnotations: { id: 'save as: $id', token: 'save as: $token' } }),
    ]);
    expect(analyzeVarChain([test])).toHaveLength(0);
  });
});

// ── warning cases ──

describe('analyzeVarChain — warning cases', () => {
  it('warns when $var in path has no prior save', () => {
    const test = makeTest('No save', [
      makeStep({ path: '/v1/users/$id' }),
    ]);
    const warnings = analyzeVarChain([test]);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('$id');
  });

  it('warns when step 2 uses $id but step 1 never saves it', () => {
    const test = makeTest('Missing save', [
      makeStep({ path: '/v1/ping' }),
      makeStep({ path: '/v1/users/$id' }),
    ]);
    const warnings = analyzeVarChain([test]);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('$id');
  });

  it('warns on forward reference: step 1 uses $id, step 2 saves $id', () => {
    const test = makeTest('Forward ref', [
      makeStep({ path: '/v1/users/$id' }),
      makeStep({ responseAnnotations: { id: 'save as: $id' } }),
    ]);
    const warnings = analyzeVarChain([test]);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('$id');
  });

  it('warns when $var appears in request body', () => {
    const test = makeTest('Body ref', [
      makeStep({ body: { ref: '$order_id' } }),
    ]);
    const warnings = analyzeVarChain([test]);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('$order_id');
  });

  it('warns when $var appears as expected response string value', () => {
    const test = makeTest('Response ref', [
      makeStep({ response: { echo_id: '$order_id' } }),
    ]);
    const warnings = analyzeVarChain([test]);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('$order_id');
  });

  it('warns when $var appears in nested expected response object', () => {
    const test = makeTest('Nested ref', [
      makeStep({ response: { user: { id: '$user_id' } } }),
    ]);
    const warnings = analyzeVarChain([test]);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('$user_id');
  });

  it('warns when not: $var annotation references undefined variable', () => {
    const test = makeTest('Not ref', [
      makeStep({ responseAnnotations: { key: 'not: $old_key' } }),
    ]);
    const warnings = analyzeVarChain([test]);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('$old_key');
  });

  it('emits one warning per undefined var in a step', () => {
    const test = makeTest('Multi undefined', [
      makeStep({ path: '/v1/$foo/$bar' }),
    ]);
    const warnings = analyzeVarChain([test]);
    // Should warn about both $foo and $bar
    expect(warnings.length).toBe(2);
  });
});

// ── warning format ──

describe('analyzeVarChain — warning message format', () => {
  it('warning contains the test name', () => {
    const test = makeTest('Create user workflow', [
      makeStep({ path: '/v1/users/$id' }),
    ]);
    const warnings = analyzeVarChain([test]);
    expect(warnings[0]).toContain('Create user workflow');
  });

  it('warning contains the 1-indexed step number', () => {
    const test = makeTest('Step number check', [
      makeStep({ path: '/v1/ping' }),
      makeStep({ path: '/v1/ping' }),
      makeStep({ path: '/v1/users/$id' }),  // step 3 (1-indexed)
    ]);
    const warnings = analyzeVarChain([test]);
    expect(warnings[0]).toContain('step 3');
  });
});

// ── false positive guard ──

describe('analyzeVarChain — no false positives', () => {
  it('does NOT warn on $100 or $99 — digit-start is not a valid var name', () => {
    // $100 looks like a dollar amount; regex requires letter/underscore after $
    const test = makeTest('Dollar amount', [
      makeStep({ response: { price: '$100', discount: '$99' } }),
    ]);
    expect(analyzeVarChain([test])).toHaveLength(0);
  });
});
