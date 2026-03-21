# Changelog

All notable changes to specdown.

## 0.8.1

Fixed duplicate `Set-Cookie` header handling — runner was overwriting first value when multiple headers shared the same name. Added CRLF line ending robustness to the parser. Recognized `title`, `author`, `description` as valid frontmatter metadata fields (no longer triggers warnings). Added CI workflow and `engines` field.

## 0.8.0

Four bugs fixed from external audit: falsey body values (`false`, `0`, `""`) were silently skipped; default base URL corrected to `http://localhost:3000`; root `.specdown` config with only headers or timeout was dropped; `analyzeVarChain()` warnings now surface during `specdown run`, not just `specdown check`.

## 0.7.0

Variable chain static analysis. `specdown check` now warns when a `$var` is referenced before any prior step saves it. New `analyze.ts` module with path-aware detection across request URLs, bodies, and expected responses.

## 0.6.0

Step context in failure output. Failures now show `Step N/M: METHOD /path` and the actual HTTP status code. `--verbose` flag added to CLI for full response body display on failure.

## 0.5.0

`specdown check` command — dry-run parse validation without making HTTP requests. Catches malformed specs, missing sections, and unparseable steps. Parser now returns warnings for silently dropped content.

## 0.4.0

Three bugs fixed via httpbin.org dogfooding: default config was injecting `Content-Type: application/json` on all requests (including GETs); `--base` flag detection used magic value comparison; `**Headers**` block only worked before `**Request**` (now accepts both orderings).

## 0.3.0

Array and nested object partial matching. Arrays use positional prefix-assertion semantics — `[]` means "is an array", shorter spec arrays are fine. Type mismatch errors now show values distinctly (`42 does not match "42"`). Response status emoji is decorative and ignored by the parser.

## 0.2.0

Content-Type inference (only sent when body is present). YAML frontmatter for per-file config (`base`, `timeout`, `headers`). Config cascade: defaults → `.specdown` → frontmatter → CLI flags. `--test` substring filter. Response header assertions with pattern matching.

## 0.1.0

Initial release. Markdown spec parser, pattern matching (`xxxx` for alphanumeric, `0000` for digits), variable chaining (`// save as: $var`), HTTP runner, `.specdown` config files, CLI with `run` command, `--format json` output, directory scanning.
