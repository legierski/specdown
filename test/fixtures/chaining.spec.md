# Chaining Example

## Create and verify

**Request** → `POST /v1/items`

```json
{
  "name": "Chain Test"
}
```

**Response** → `🟢 201 Created`

```json
{
  "id": "item_xxxxxxxxxxxx",  // save as: $item_id
  "name": "Chain Test"
}
```

Now fetch the created item:

**Request** → `GET /v1/items/$item_id`

**Response** → `🟢 200 OK`

```json
{
  "id": "$item_id",
  "name": "Chain Test"
}
```
