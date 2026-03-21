/**
 * Shared type definitions for specdown.
 *
 * Step types (HttpStep, CliStep, SqlStep), the Step union,
 * Test, and ParseResult are used across parser, runner, analyze,
 * check, format, and index modules.
 */

import type { SpecConfig } from './config.js';

export type { SpecConfig };

export interface HttpStep {
  mode: 'http';
  headers: Record<string, string>;
  method: string;
  path: string;
  body: any;
  bodyAnnotations: Record<string, string>;
  status: number;
  responseHeaders: Record<string, string>;
  response: any;
  responseAnnotations: Record<string, string>;
}

export interface CliStep {
  mode: 'cli';
  command: string;
  expectedExit: number | null;
  expectedOutput: any;
  outputAnnotations: Record<string, string>;
}

export interface SqlStep {
  mode: 'sql';
  query: string;
  expectedRows: number | null;
  expectedType: 'rows' | 'affected' | null;
  expectedResult: any;
  resultAnnotations: Record<string, string>;
}

export type Step = HttpStep | CliStep | SqlStep;

export interface Test {
  name: string;
  steps: Step[];
}

export interface ParseResult {
  tests: Test[];
  /** Human-readable warnings about sections or steps that were silently skipped. */
  warnings: string[];
}
