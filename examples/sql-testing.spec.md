---
connection: test/fixtures/dogfood.db
---

# SQL Mode — Dogfood Tests

These tests run against a real SQLite database to verify specdown's SQL mode end-to-end.

## Select all users

**Query** → `SELECT id, name, email, status FROM users ORDER BY id`

**Result** → `🟢 3 rows`

```json
[
  {"id": 1, "name": "Alice", "email": "alice@example.com", "status": "active"},
  {"id": 2, "name": "Bob", "email": "bob@example.com", "status": "active"},
  {"id": 3, "name": "Charlie", "email": "charlie@example.com", "status": "inactive"}
]
```

## Filter active users

**Query** → `SELECT name, email FROM users WHERE status = 'active' ORDER BY name`

**Result** → `🟢 2 rows`

```json
[
  {"name": "Alice", "email": "alice@example.com"},
  {"name": "Bob", "email": "bob@example.com"}
]
```

## Single row lookup

**Query** → `SELECT name, email FROM users WHERE id = 1`

**Result** → `🟢 1 row`

```json
{
  "name": "Alice",
  "email": "alice@example.com"
}
```

## Empty result set

**Query** → `SELECT * FROM users WHERE name = 'Nobody'`

**Result** → `🟢 0 rows`

```json
[]
```

## Insert and verify

**Query** → `INSERT INTO users (name, email) VALUES ('Diana', 'diana@example.com')`

**Result** → `🟢 1 affected`

**Query** → `SELECT name, email FROM users WHERE name = 'Diana'`

**Result** → `🟢 1 row`

```json
{
  "name": "Diana",
  "email": "diana@example.com"
}
```

## Variable chaining across queries

**Query** → `SELECT email FROM users WHERE name = 'Alice'`

**Result** → `🟢 1 row`

```json
{
  "email": "any-text"  // save as: $alice_email
}
```

**Query** → `SELECT name FROM users WHERE email = '$alice_email'`

**Result** → `🟢 1 row`

```json
{
  "name": "Alice"
}
```

## Multi-line query with GROUP BY

**Query** ↓

```sql
SELECT status, COUNT(*) as count
FROM users
WHERE status = 'active'
GROUP BY status
```

**Result** → `🟢 1 row`

```json
{
  "status": "active"
}
```

## Cleanup inserted row

**Query** → `DELETE FROM users WHERE name = 'Diana'`

**Result** → `🟢 1 affected`

## Count after cleanup

**Query** → `SELECT * FROM users`

**Result** → `🟢 3 rows`
