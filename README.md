# specdown

Documentation that tests itself. Write your specs in markdown — API calls, CLI commands — and run them as tests.

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
specdown run api.spec.md --verbose     # show full response body on failure

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

## Failure output

When a test fails, specdown shows which step failed and the HTTP status received:

```
docs/api.spec.md
  ✗ Create and retrieve user (312ms)
    Step 2/3: GET /v1/users/usr_abc
    Response: 200
    Field "id": "usr_abc" does not match "usr_xxxxxxxxxxxx"
```

By default, the response body is shown only if it's short (≤ 200 chars). Use `--verbose` to always show it:

```bash
specdown run api.spec.md --verbose
```

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

**Variable substitution:** `$user_id` in paths, request bodies, and headers is replaced with the captured value.

### Negative assertions (`not:`)

Use `// not: $var` to assert a field does NOT equal a previously saved value. The pattern must still match, but the actual value must differ:

````markdown
## Create two users with different IDs

**Request** → `POST /v1/users`

```json
{"name": "Alice"}
```

**Response** → `🟢 201 Created`

```json
{
  "id": "usr_xxxxxxxxxxxx",  // save as: $first_id
  "name": "Alice"
}
```

**Request** → `POST /v1/users`

```json
{"name": "Bob"}
```

**Response** → `🟢 201 Created`

```json
{
  "id": "usr_xxxxxxxxxxxx",  // not: $first_id
  "name": "Bob"
}
```
````

This verifies that each user gets a unique ID — the second `id` must match the `usr_xxxxxxxxxxxx` pattern but must not equal the first user's ID. If `$first_id` is undefined, the test fails explicitly.

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

## CLI mode — testing command-line tools

> ⚠️ **CLI mode executes shell commands on your machine.** Only run specs you trust. Treat `.spec.md` files with `**Run**` blocks like shell scripts — review before running.

Use `**Run**` and `**Output**` instead of `**Request**` and `**Response**` to test CLI tools:

````markdown
## Simple echo

**Run** → `echo hello world`

**Output** → `🟢 exit 0`

```
hello world
```
````

### Inline vs. block commands

Inline commands go in backticks after the arrow:

```markdown
**Run** → `echo hello`
```

Multi-line commands use a code block:

````markdown
**Run** ↓

```bash
echo "line one" && \
echo "line two"
```
````

### Exit codes

The exit code is specified in the **Output** line. Use any emoji (decorative) or none:

```markdown
**Output** → `🟢 exit 0`     # expect success
**Output** → `🔴 exit 1`     # expect failure
**Output**                    # don't check exit code
```

### JSON output matching

CLI output is matched the same way as API responses — partial matching, patterns, annotations:

````markdown
## Check package info

**Run** → `npm pkg get name version`

**Output** → `🟢 exit 0`

```json
{
  "name": "xxxxxxxxxxxx",
  "version": "x.x.x"
}
```
````

### Variable chaining across CLI and HTTP steps

Variables saved in CLI steps are available in later steps (CLI or HTTP), and vice versa:

````markdown
## CLI captures a value, HTTP uses it

**Run** → `echo '{"token":"abc123"}'`

**Output** → `🟢 exit 0`

```json
{
  "token": "xxxxxx"  // save as: $api_token
}
```

**Request** → `GET /v1/me`

**Headers**

```http
Authorization: Bearer $api_token
```

**Response** → `🟢 200 OK`
````

### Timeout

CLI steps use `cli.timeout` from the `[cli]` TOML section if set, otherwise fall back to the HTTP timeout. Commands that exceed the timeout are killed and the test fails.

## SQL mode — testing databases

> ⚠️ **SQL mode executes queries against real databases.** Only run specs you trust. Treat `.spec.md` files with `**Query**` blocks like SQL scripts — review before running.

Use `**Query**` and `**Result**` to test databases directly. Currently supports SQLite via the `sqlite3` CLI.

````markdown
## Find active users

**Query** → `SELECT name, email FROM users WHERE status = 'active'`

**Result** → `🟢 2 rows`

```json
[
  {"name": "Alice", "email": "alice@example.com"},
  {"name": "Bob", "email": "bob@example.com"}
]
```
````

### Row and affected counts

Specify expected row count for SELECT queries or affected count for write operations:

```markdown
**Result** → `🟢 3 rows`       # SELECT returned 3 rows
**Result** → `🟢 1 affected`   # INSERT/UPDATE/DELETE affected 1 row
**Result** → `🟢 0 rows`       # empty result set
**Result**                      # don't check count
```

### Multi-line queries

Use a code block for complex queries:

````markdown
**Query** ↓

```sql
SELECT u.name, COUNT(o.id) as order_count
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.name
HAVING order_count > 0
```

**Result** → `🟢 1 row`
````

### Single-row shorthand

For single-row results, use an object instead of an array — specdown matches it against the first row:

````markdown
**Query** → `SELECT name, email FROM users WHERE id = 1`

**Result** → `🟢 1 row`

```json
{
  "name": "Alice",
  "email": "alice@example.com"
}
```
````

### Variable chaining with SQL

Variables work across all modes — save a value from a SQL query, use it in an HTTP request:

````markdown
## Insert and verify

**Query** → `INSERT INTO users (name) VALUES ('Charlie')`

**Result** → `🟢 1 affected`

**Query** → `SELECT name FROM users WHERE name = 'Charlie'`

**Result** → `🟢 1 row`

```json
{
  "name": "Charlie"
}
```
````

### Database connection

Configure the database in `.specdown`:

```toml
[sql]
connection = "test.db"
```

Or via frontmatter (`connection: test.db`), or CLI flag (`--connection test.db`).

## Config

Create a `.specdown` file in your project root (TOML format):

```toml
[http]
base = "http://localhost:3000"
timeout = 5000

[http.headers]
Authorization = "Bearer your_token"
Content-Type = "application/json"

[cli]
shell = "bash"
timeout = 10000

[sql]
connection = "test.db"
```

Config files cascade: a `.specdown` in a subdirectory merges with the root config, with the subdirectory taking precedence.

### Per-file config (frontmatter)

Add a YAML frontmatter block at the top of a spec file to override config for that file only:

```markdown
---
base: http://staging.api.com
timeout: 10000
connection: test.db
shell: zsh
headers:
  Authorization: Bearer staging_token
  X-Version: "2"
---

# Users API
...
```

Supported fields: `base`, `timeout`, `headers`, `connection`, `shell`. Unknown fields emit a warning.

> **Note:** `timeout` in frontmatter applies to HTTP mode. For mode-specific timeouts, use the `[cli]` and `[sql]` sections in `.specdown` TOML config. CLI and SQL steps fall back to the HTTP timeout if no mode-specific timeout is set.

Frontmatter merges with `.specdown` config (frontmatter wins per-key). The `--base` CLI flag overrides frontmatter base (but not headers or timeout).

### Removing inherited headers

In config cascade (`.specdown` files and frontmatter), set a header to `"none"` or `""` to remove it:

```toml
# In a subfolder .specdown — remove auth for public endpoints
[http.headers]
Authorization = "none"
```

In step-level `**Headers**` blocks, use an empty value to remove a header for that step only:

```markdown
**Request** → `GET /v1/public`

**Headers**

```http
Authorization:
```

**Response** → `🟢 200 OK`
```

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

## Known limitations

- **Numeric patterns in JSON blocks**: Pattern values like `00` or `0000` must be quoted strings in JSON response/output blocks (`"count": "0000"`), not bare numbers (`"count": 0000`). Bare numeric patterns are invalid JSON and will crash the parser. Use `"any-text"` for fields where you don't care about the exact value, or use exact numbers for precise matching.
- **Variable scope**: `$vars` are scoped per-test (step chain), not per-file. A variable saved in one `## Test` section is not available in another.
- **Array annotations**: `// save as:` doesn't work inside array elements — only top-level object fields.
- **No parallel execution**: Steps and tests run sequentially.

## License

MIT
