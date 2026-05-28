---
title: 'Routes'
linkTitle: 'Routes'
weight: 2
description: 'Route HTTP traffic from a (domain, path) pair to a specific deployment.'
lead: 'Routes are how a request lands on a deployment. Each route is a tuple — domain, path, target — and the platform matches the longest path prefix and forwards from there.'
---

## The Routes page

The Routes tab lists every route in the project. Each row shows the full
request URL (`https://<domain><path>`), the target deployment, the location,
and any extra route config.

{{< shot src="/img/route-list.png" url="console.deploys.app/route?project=acme" alt="Four routes mapping acme.example.com and subdomains to web and api deployments" caption="Four routes — a path split between web and api on the apex, plus subdomain routes." >}}

## Route a domain to a deployment

The simplest case — `(domain, path)` → deployment:

```bash
deploys route create \
  --project acme --location gke.cluster-rcf2 \
  --domain acme.example.com --path / \
  --deployment web
```

`path` is matched as a prefix. With both `/` → `web` and `/api` → `api` on the
same domain, a request to `/api/v1/users` is forwarded to `api` (longest match
wins).

## Routes by path

You can split a single domain across deployments by path:

| Route | Target |
|---|---|
| `acme.example.com/` | `web` (the marketing site) |
| `acme.example.com/api` | `api` (the JSON API) |
| `acme.example.com/admin` | `admin` (the back-office UI) |

The platform strips the matched prefix before forwarding — `api` receives the
request at `/v1/users`, not `/api/v1/users`.

## Routes with config (v2)

The `routeV2` flow lets you target arbitrary URLs instead of just deployments,
and attach extra request handling:

- **`target`** — a target URL or `deployment://<name>` reference.
- **`config.basicAuth`** — a username + password the gateway checks before
  forwarding.
- **`config.forwardAuth`** — a separate endpoint the gateway calls first; if it
  returns 2xx the request is forwarded, otherwise the response is returned to
  the client. Request and response headers can be whitelisted via
  `authRequestHeaders` / `authResponseHeaders`.

```bash
curl https://api.deploys.app/route.createV2 \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{
    "project": "acme",
    "location": "gke.cluster-rcf2",
    "domain": "internal.acme.dev",
    "path": "/admin",
    "target": "deployment://admin",
    "config": {
      "basicAuth": { "user": "ops", "password": "…" }
    }
  }'
```

## Listing and deleting

```bash
deploys route list --project acme --location gke.cluster-rcf2

deploys route delete \
  --project acme --location gke.cluster-rcf2 \
  --domain acme.example.com --path /old
```

Deleting a route stops traffic to that prefix immediately. The deployment isn't
affected — only the routing.

## How a request flows

```text
client
  │
  ▼ HTTPS to acme.example.com/api/v1/users
edge / CDN (if domain.cdn = true)
  │
  ▼
location ingress
  │
  ▼ longest-match: acme.example.com/api → deployment://api
deployment "api" pods (autoscaling between minReplicas..maxReplicas)
```

If no route matches, the gateway returns **404**. If a route matches but the
target deployment is paused or unhealthy, the gateway returns **503**.
