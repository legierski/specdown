# specdown

API documentation that tests itself. Write your API specs in markdown, run them as tests.

## Install

```bash
npm install -g specdown
```

## Usage

```bash
specdown run api.spec.md
specdown run docs/
specdown run api.spec.md --base http://localhost:8080
specdown run docs/ --test "create user"
specdown run api.spec.md --format json

# Validate spec files without making HTTP requests:
specdown check api.spec.md
specdown check docs/
```

## `specdown check` — dry-run validation

`check` parses your spec files without hitting a server. Use it in CI before running tests, or when setting up a new spec file.

```
$ specdown check docs/api.spec.md

docs/api.spec.md [http://localhost:3000]
  ✓ Create user (2 steps)
  ✓ Delete user (1 step)

2 tests in 1 file.
```

If the parser finds no tests or silently skips a step, `check` reports it:

```
docs/onboarding.spec.md [http://localhost:3000]
  ⚠ No tests found
    "Introduction" — section has no Request lines (no tests generated)

0 tests in 1 file. Warnings found.
```

A `**Response**` line with no status code (step silently dropped in `run`) is also flagged:

```
docs/api.spec.md [http://localhost:3000]
  ✓ Get users (1 step)
  ⚠ "Create user" — Response line has no HTTP status code (step skipped)

1 test in 1 file. Warnings found.
```

Exit code 0 if all files have tests and no warnings; 1 otherwise — suitable for CI gates.

## Spec file format

A spec file is a markdown file with `## H2` headings as test cases. Each test case contains one or more request/response pairs.

````markdown
# Users API

## Create a user

**Request** → `POST /v1/users`

```json
{"name": "Alice", "email": "alice@example.com"}
```

**Response** → `🟢 201 Created`

```json
{
  "id": "usr_xxxxxxxxxxxx",
  "name": "Alice",
  "email": "alice@example.com"
}
```

## Fetch the user

**Request** → `GET /v1/users/$user_id`

**Response** → `🟢 200 OK`

```json
{
  "id": "$user_id",
  "name": "Alice"
}
```
````

**Pattern matching:** `xxxxxxxxxxxx` matches any 12-character alphanumeric string. `0000000000` matches any digits of the same length.

**Response status emoji:** The emoji before the status code is decorative — specdown only reads the 3-digit number. `🟢 200 OK`, `🔴 404 Not Found`, `200 OK` (no emoji), and `🚀 201 Created` all parse identically.

**Variable capture:** `"id": "usr_xxxxxxxxxxxx",  // save as: $user_id` captures the value for use in later steps.

**Variable substitution:** `$user_id` in paths and request bodies is replaced with the captured value.

### Response header assertions

Assert response headers using a `**Response Headers**` block between the status line and optional body:

````markdown
## Create a user

**Request** → `POST /v1/users`

```json
{"name": "Alice"}
```

**Response** → `🟢 201 Created`

**Response Headers**

```http
Content-Type: application/json
X-Request-Id: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

```json
{"id": "usr_xxxxxxxxxxxx"}
```
````

Header names are matched case-insensitively (RFC 7230). Header values use the same pattern matching as response bodies (`xx`, `00` placeholders).

**Gotcha:** The full header value must match. If your server sends `Content-Type: application/json; charset=utf-8`, asserting `Content-Type: application/json` will fail. Use a pattern to cover the variable suffix:

```http
Content-Type: application/json; charset=xxxxx
```

## Config

Create a `.specdown` file in your project root (TOML format):

```toml
[http]
base = "http://localhost:3000"
timeout = 5000

[http.headers]
Authorization = "Bearer your_token"
Content-Type = "application/json"
```

Config files cascade: a `.specdown` in a subdirectory merges with the root config, with the subdirectory taking precedence.

### Per-file config (frontmatter)

Add a YAML frontmatter block at the top of a spec file to override config for that file only:

```markdown
---
base: http://staging.api.com
timeout: 10000
headers:
  Authorization: Bearer staging_token
  X-Version: "2"
---

# Users API
...
```

Supported fields: `base`, `timeout`, `headers`. Unknown fields emit a warning.

Frontmatter merges with `.specdown` config (frontmatter wins per-key). The `--base` CLI flag overrides frontmatter base (but not headers or timeout).

### Removing inherited headers

To remove a config header for a specific request, set it to an empty value:

```markdown
**Request** → `GET /v1/public`

**Headers**

```http
Authorization:
```

**Response** → `🟢 200 OK`
```

This removes `Authorization` from that step only.

The `**Headers**` block can appear either before or after the `**Request**` line — both orderings work. The natural HTTP message order (request line first, then headers) is supported:

```markdown
**Request** → `POST /v1/items`

**Headers**

```http
Idempotency-Key: my-key-123
```

```json
{"name": "widget"}
```

**Response** → `🟢 201 Created`
```

## Filtering tests

Run only tests whose name contains a substring (case-insensitive):

```bash
specdown run docs/ --test "create"
specdown run api.spec.md --test "health check"
```

If no tests match, specdown exits 1 with an error. The results summary shows how many tests were skipped.

## Output formats

```bash
specdown run api.spec.md                 # pretty (default)
specdown run api.spec.md --format json   # machine-readable JSON
```

JSON output includes `passed`, `failed`, and `skipped` counts.

## License

MIT
