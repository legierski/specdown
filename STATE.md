# specdown — project state

Last updated: v0.8.1

## Version history

| Version | Features |
|---------|----------|
| v0.1.0  | `specdown run`, basic request/response matching |
| v0.2.0  | JSON annotations (`save as:`, `one of:`, `not:`, `length:`), pattern matching (`xx+`, `00+`, `any-*`, email) |
| v0.3.0  | Response headers assertions, `--test` filter, config cascade (specdown.json → frontmatter → `--base`) |
| v0.4.0  | Fix: `**Headers**` block accepted after `**Request**` line; `--base` override detection |
| v0.5.0  | `specdown check` (dry-run parse validation); parser warnings surface silently-dropped steps; cli.ts split into args.ts / files.ts / format.ts |
| v0.6.0  | `FailedStepContext` on TestResult (stepIndex, stepCount, method, path, status, actualBody); step context in pretty output; `--verbose` flag; `makeFailedStep` helper extracted |
| v0.7.0  | Variable chain validation in `specdown check`; `src/analyze.ts` with `analyzeVarChain()`; false-positive guard for `$100`/`$99` |
| v0.8.0  | Fix 4 Kai-audit bugs: falsey body/response skipped (`!== null`), default base corrected, partial root config preserved, var-chain warnings in `runSpec` |
| v0.8.1  | Fix duplicate response header overwrite (accumulate `string[]`); 3 external audit tests (CRLF, Set-Cookie, colon-in-value) |

## Source modules

| File | Responsibility |
|------|----------------|
| `cli.ts` | Entry point, command dispatch, orchestration |
| `args.ts` | CLI argument parsing → `CliOptions` |
| `files.ts` | Spec file discovery (`findSpecFiles`) |
| `runner.ts` | HTTP execution, test results → `SpecResult` |
| `check.ts` | Dry-run parse validation → `CheckResult` |
| `parser.ts` | Markdown → `{ tests, warnings }` (`ParseResult`) |
| `extract.ts` | JSON block and headers block extraction helpers |
| `frontmatter.ts` | YAML frontmatter parse/strip |
| `matcher.ts` | Response matching, variable save/substitute |
| `pattern.ts` | Pattern matching (`xx+`, `00+`, `any-*`, `email`) |
| `config.ts` | Config resolution, merge, defaults |
| `format.ts` | Terminal output formatters (pretty, json, check) |
| `analyze.ts` | Static variable chain analysis → warnings |
| `index.ts` | Public library exports |
| `json.ts` | JSON annotation parsing helpers |

## Test files (26 total, 449 tests)

Each source module has a corresponding test file (enforced by pre-commit hook):
`test/${basename}.test.ts` or `test/${basename}-edge-cases.test.ts`

## Variable system (implemented, v0.2+)

- Parser: `// save as: $var` stored in `responseAnnotations`
- Matcher: on `save as:` match, writes `vars[$name] = actual[key]`
- Runner: `substituteVars(path, vars)` + `substituteVars(body, vars)` before each step
- Runner: `vars` dict scoped per-test, reset between tests
- Check + Run: both call `analyzeVarChain()` — warnings surface in both modes (fixed v0.8.0)

## Known gaps

- No `--watch` mode
- `analyzeVarChain` scans responseAnnotations keys for `save as:` — does not traverse body annotations (not a real use case yet)

## Autonomous decisions (2026-03-21, Marcus silent 30+ min)

### v0.9 plan — refactor first, then features

Rule 7 violations (files > ~100 lines): runner.ts (237), parser.ts (222), matcher.ts (165),
cli.ts (157), config.ts (151), frontmatter.ts (110), format.ts (108).

Most urgent: **runner.ts** at 237 lines bundles three distinct concerns:
  1. HTTP orchestration (fetch, abort, redirect)
  2. Response header assertions
  3. Response body assertions

Decision: extract header/body assertion logic into `src/assert.ts` — a new small module
containing `assertHeaders()` and `assertBody()`. runner.ts becomes the loop only.

Feature gaps considered for v0.9:
  - `--bail`: stop on first failure (common CI need, low effort)
  - `--quiet`: only show failures (complement to --verbose)
  - env var substitution in config (`${API_KEY}`) — complex, defer
  - Non-JSON bodies (form-encoded) — defer to v0.10+

Priority order: refactor runner.ts → add --bail → add --quiet → reassess
