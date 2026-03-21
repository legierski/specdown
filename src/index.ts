/**
 * specdown — API documentation that tests itself.
 *
 * Write your API specs in markdown. They render beautifully on GitHub.
 * They also run as tests.
 */

export { parseMarkdownSpec } from './parser.js';
export type { Test, Step, HttpStep, CliStep, SqlStep, SpecConfig, ParseResult } from './types.js';
export { matchResponse, substituteVars } from './matcher.js';
export { toPattern, matchesPattern } from './pattern.js';
export { splitLineComment, parseJsonWithAnnotations } from './json.js';
export { runSpec, type SpecResult, type TestResult } from './runner.js';
export { defaultConfig } from './config.js';
