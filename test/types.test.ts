/**
 * Tests for types.ts — shared type definitions.
 *
 * types.ts is pure TypeScript interfaces with no runtime code.
 * These tests verify the types are importable and usable.
 */

import { describe, it, expect } from 'vitest';
import type { HttpStep, CliStep, SqlStep, Step, Test, ParseResult, SpecConfig } from '../src/types.js';

describe('types', () => {
  it('HttpStep interface is usable', () => {
    const step: HttpStep = {
      mode: 'http',
      headers: {},
      method: 'GET',
      path: '/test',
      body: null,
      bodyAnnotations: {},
      status: 200,
      responseHeaders: {},
      response: null,
      responseAnnotations: {},
    };
    expect(step.mode).toBe('http');
  });

  it('CliStep interface is usable', () => {
    const step: CliStep = {
      mode: 'cli',
      command: 'echo hello',
      expectedExit: 0,
      expectedOutput: 'hello',
      outputAnnotations: {},
    };
    expect(step.mode).toBe('cli');
  });

  it('SqlStep interface is usable', () => {
    const step: SqlStep = {
      mode: 'sql',
      query: 'SELECT 1',
      expectedRows: 1,
      expectedType: 'rows',
      expectedResult: null,
      resultAnnotations: {},
    };
    expect(step.mode).toBe('sql');
  });

  it('Step union discriminates by mode', () => {
    const steps: Step[] = [
      { mode: 'http', headers: {}, method: 'GET', path: '/', body: null, bodyAnnotations: {}, status: 200, responseHeaders: {}, response: null, responseAnnotations: {} },
      { mode: 'cli', command: 'ls', expectedExit: 0, expectedOutput: null, outputAnnotations: {} },
      { mode: 'sql', query: 'SELECT 1', expectedRows: null, expectedType: null, expectedResult: null, resultAnnotations: {} },
    ];
    expect(steps.map(s => s.mode)).toEqual(['http', 'cli', 'sql']);
  });

  it('Test interface holds name and steps', () => {
    const test: Test = {
      name: 'My test',
      steps: [],
    };
    expect(test.name).toBe('My test');
    expect(test.steps).toEqual([]);
  });

  it('ParseResult interface holds tests and warnings', () => {
    const result: ParseResult = {
      tests: [],
      warnings: ['no tests found'],
    };
    expect(result.warnings).toHaveLength(1);
  });
});
