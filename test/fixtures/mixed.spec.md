# Mixed Spec

Some documentation introduction.

## Introduction

This section has no test — just documentation.

## Working test

**Request** → `POST /v1/items`

```json
{"name": "Works"}
```

**Response** → `🟢 201 Created`

```json
{
  "id": "item_xxxxxxxxxxxx",
  "name": "Works"
}
```

## Another docs section

More documentation here.

## Another working test

**Request** → `GET /v1/items/1`

**Response** → `🟢 200 OK`

```json
{
  "id": "1",
  "name": "any-text"
}
```
