---
title: 'API overview'
linkTitle: 'Overview'
weight: 1
description: 'One endpoint, one verb, JSON in and out. Authentication, request shape, error envelope.'
lead: 'The Deploys.app API is a single HTTPS endpoint that takes JSON POSTs. Each function — deployment.deploy, domain.create, role.bind — is its own path. The response envelope is the same for everything.'
---

## Endpoint

```text
https://api.deploys.app/
```

Every call is `POST <endpoint>/<function>` with a JSON body. There is no
versioning prefix — functions are added compatibly; breaking changes get a new
function name (e.g. `route.create` vs `route.createV2`).

## Authentication

Every call needs an `Authorization` header.

**Bearer token** — for short-lived personal use:

```http
Authorization: Bearer <token>
```

**HTTP Basic** — for [service accounts](/access/service-accounts/) (the
right choice for CI and back-end services):

```http
Authorization: Basic base64(<email>:<key>)
```

Unauthenticated calls and calls with a bad token return **401 Unauthorized**.
Calls authenticated but missing a [permission](/access/roles/) return a
**200 OK** response with `{ "ok": false, "error": { "message": "api: forbidden" } }` —
business errors come back in the body, not as HTTP status codes (see [Errors](#errors)).

## Request shape

```bash
curl https://api.deploys.app/deployment.deploy \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project": "acme",
    "location": "gke.cluster-rcf2",
    "name": "web",
    "image": "registry.deploys.app/acme/web:v2.4.1",
    "type": "WebService",
    "port": 8080,
    "minReplicas": 2,
    "maxReplicas": 6
  }'
```

Bodies are JSON. Field names are camelCase. Optional pointer-style fields can
be omitted to mean "leave unchanged" on update-style calls; see
[Conventions](/api/conventions/) for the partial-update model used by
`deployment.deploy`.

## Response envelope

Every call returns a JSON object with one of two shapes.

**Success:**

```json
{ "ok": true, "result": { … } }
```

The `result` shape depends on the call — `deployment.list` returns
`{ "items": [...] }`, `deployment.deploy` returns an empty object, and so on.

**Failure:**

```json
{ "ok": false, "error": { "message": "api: deployment not found" } }
```

The `error.message` is a short stable string you can switch on
programmatically (see [Errors](#errors)).

HTTP status codes:

- **200 OK** — success or business error (check `ok` in the body).
- **401 Unauthorized** — missing or invalid credentials.
- **5xx** — server fault. Safe to retry with exponential backoff.

## Errors

The `error.message` field is a small, stable set of strings. The common ones:

| `error.message` | Meaning |
|---|---|
| `api: unauthorized` | Token missing or invalid. |
| `api: forbidden` | Authenticated but missing a permission. |
| `api: validate error` | Request body invalid; details in `error.validate[]`. |
| `api: deployment not found` | (Or other `… not found` variants.) The named resource doesn't exist. |

For `validate error`, the response also includes an array of field-level
errors:

```json
{
  "ok": false,
  "error": {
    "message": "api: validate error",
    "validate": [
      { "field": "name", "message": "name required" }
    ]
  }
}
```

## A quick orientation tour

```bash
# who am I?
curl https://api.deploys.app/me.get \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" -d '{}'

# what locations can I deploy to?
curl https://api.deploys.app/location.list \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" -d '{}'

# my deployments in one project
curl https://api.deploys.app/deployment.list \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{ "project": "acme", "location": "gke.cluster-rcf2" }'
```

## Where the call lives

The same backend serves the console and the CLI:

- **Console** — POSTs to the same functions through a SvelteKit server proxy
  that adds the token from the user's session cookie.
- **CLI** — also POSTs to the same functions; auth comes from the
  `DEPLOYS_TOKEN` or `DEPLOYS_AUTH_*` env vars (see
  [CLI](/automation/cli/)).
- **Direct** — your code calls these URLs with HTTP Basic or Bearer; this
  page.

Move on to [Conventions](/api/conventions/) for the full function catalog,
the partial-update model, and pagination patterns.
