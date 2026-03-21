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

**Variable capture:** `"id": "usr_xxxxxxxxxxxx",  // save as: $user_id` captures the value for use in later steps.

**Variable substitution:** `$user_id` in paths and request bodies is replaced with the captured value.

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

## Output formats

```bash
specdown run api.spec.md                 # pretty (default)
specdown run api.spec.md --format json   # machine-readable JSON
```

## License

MIT
