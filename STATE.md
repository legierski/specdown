# specdown — project state

Last updated: v0.5.0

## Version history

| Version | Features |
|---------|----------|
| v0.1.0  | `specdown run`, basic request/response matching |
| v0.2.0  | JSON annotations (`save as:`, `one of:`, `not:`, `length:`), pattern matching (`xx+`, `00+`, `any-*`, email) |
| v0.3.0  | Response headers assertions, `--test` filter, config cascade (specdown.json → frontmatter → `--base`) |
| v0.4.0  | Fix: `**Headers**` block accepted after `**Request**` line; `--base` override detection |
| v0.5.0  | `specdown check` (dry-run parse validation); parser warnings surface silently-dropped steps; cli.ts split into args.ts / files.ts / format.ts |

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
| `index.ts` | Public library exports |
| `json.ts` | JSON annotation parsing helpers |

## Test files (25 total, 399 tests)

Each source module has a corresponding test file (enforced by pre-commit hook):
`test/${basename}.test.ts` or `test/${basename}-edge-cases.test.ts`

## Variable system (implemented, v0.2+)

- Parser: `// save as: $var` stored in `responseAnnotations`
- Matcher: on `save as:` match, writes `vars[$name] = actual[key]`
- Runner: `substituteVars(path, vars)` + `substituteVars(body, vars)` before each step
- Runner: `vars` dict scoped per-test, reset between tests
- Check: does **not** validate variable chain coherence (known gap — deferred from v0.5)

## Known gaps

- `check` does not validate that `$var` references in step N are satisfied by `save as:` in step ≤N-1
- No step context in failure output (test fails, but which step/URL is not shown)
- No `--watch` mode
