# Simple API

A basic test fixture for specdown.

## Create a resource

**Request** → `POST /v1/items`

```json
{
  "name": "Test Item"
}
```

**Response** → `🟢 201 Created`

```json
{
  "id": "item_xxxxxxxxxxxx",
  "name": "Test Item"
}
```

## Get a resource

**Request** → `GET /v1/items/1`

**Response** → `🟢 200 OK`

```json
{
  "id": "1",
  "name": "any-text"
}
```
