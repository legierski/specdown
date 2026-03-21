/**
 * specdown — API documentation that tests itself.
 *
 * Write your API specs in markdown. They render beautifully on GitHub.
 * They also run as tests.
 */

export { parseMarkdownSpec, type Test, type Step, type HttpStep, type CliStep } from './parser.js';
export { matchResponse, substituteVars } from './matcher.js';
export { toPattern, matchesPattern } from './pattern.js';
export { splitLineComment, parseJsonWithAnnotations } from './json.js';
export { runSpec, type SpecResult, type TestResult } from './runner.js';
export { type SpecConfig, defaultConfig } from './config.js';
