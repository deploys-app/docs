---
title: 'Request & response transforms'
linkTitle: 'Transforms'
weight: 5
description: 'Rewrite requests and responses at the edge by expression — redirect, rewrite paths, inject headers, set CORS — without touching your origin.'
lead: 'Transforms are an ordered list of rules that mutate a request on its way in or a response on its way out. Each rule runs in one phase — request or response — is optionally scoped by a filter expression, and applies a small, fixed set of operations: set/remove headers, rewrite the path or query, redirect, set a status, or add CORS.'
---

{{< callout type="note" >}}
Transforms are currently in **preview** and roll out per location. The console
shows a "Preview" badge in the sidebar when they're available. A location must
have the transform capability enabled before `transform.set` will accept a zone.
{{< /callout >}}

The proxy in front of your project can already filter and gate traffic — the
[Firewall](/networking/waf/) blocks, the [Routes](/networking/routes/) layer
redirects and strips prefixes, the [cache](/networking/cache/) stores. What it
couldn't do, until now, is *declaratively rewrite* a request or response on a
condition you choose. Forcing `www`, injecting HSTS and other security headers,
rewriting a legacy path, or setting CORS for a single-page app all used to mean a
forward-auth detour, origin code, or a one-off platform change.

Transforms close that gap. They are deliberately the **middle path** between two
extremes: forward-auth and route hacks (expressive only by abuse), and a full
Workers/WASM runtime (arbitrary user code at the edge, with all the compute,
sandboxing, and supply-chain risk that implies). A transform is **no user
code** — just a compiled boolean filter and a fixed list of header/redirect/
rewrite/CORS operations — and it covers the long tail of day-to-day edge
behavior.

## Phases

**Phase is the primary axis of every rule.** A rule runs in exactly one of two
places:

| Phase | When it runs | What it can do |
|---|---|---|
| **`request`** | Before the request reaches your deployment | Set/remove request headers, rewrite the path or query, or **redirect** (short-circuit — the request is never proxied). |
| **`response`** | As the response heads back to the client | Set/remove response headers, override the status, or add **CORS**. |

Phase is **required** on every rule — there is no default. Header operations
(`set-header` / `remove-header`) are valid in both phases, so an omitted phase
would silently become a request-phase mutation; the API rejects a rule with no
phase rather than guess.

A rule is therefore **one phase + one optional filter + an ordered list of
operations of that phase**. Every operation in a rule must belong to the rule's
phase — a `redirect` in a response rule, or a `set-status` in a request rule, is
rejected at validation time.

## How rules work

`transform.set` replaces the **whole** rule set for a (project, location) zone —
exactly like `waf.set` and `cache.set`. Always send the full list; a bare set
with no rules clears the zone. One invalid rule rejects the entire batch and the
previous good set stays live, so a bad edit never takes a zone partially live.

Within a phase, rules run in ascending **`priority`** (ties broken by id). Request
rules compose top to bottom: each rule's filter sees the request **as already
mutated** by the higher-priority request rules before it. **Across** phases there
is no single order — every request rule runs at request time, every response rule
at response time. Don't read the flat list as one totally-ordered pipeline; read
it as two phase-grouped pipelines.

```json
{
  "id": "",
  "description": "force www",
  "phase": "request",
  "filter": "request.host == 'acme.com'",
  "ops": [
    { "type": "redirect", "to": "https://www.acme.com$uri", "status": 301 }
  ],
  "priority": 5
}
```

- **`id`** — send `""` to mint a new server-managed id, or echo an existing id
  from `transform.get` / `transform.list` to keep a rule's identity across edits.
- **`mode`** — omit it (or send `""`) to **enforce** — apply the operations (the
  default); set `"shadow"` to compile and count the rule but mutate nothing.
  `"enforce"` is not a valid value; the enforce mode is the empty default. See
  [Roll out safely](#roll-out-safely).
- **`filter`** — an optional CEL expression scoping the rule
  ([below](#the-filter-expression)). Empty applies the rule to every request.

## The operations

Header operations are **phase-polymorphic**: `set-header` / `remove-header` mean
request headers in a request rule and response headers in a response rule. The
rest are phase-specific.

| Phase | `type` | Required args | Optional args | What it does |
|---|---|---|---|---|
| request | `set-header` | `name`, `value` | — | Set a request header before the deployment sees it. |
| request | `remove-header` | `name` | — | Strip a request header. |
| request | `rewrite-path` | `path` **xor** (`regex` + `replace`) | — | Replace the request path with a literal `path`, or RE2-rewrite it with `regex`/`replace`. |
| request | `rewrite-query` | `query` and/or `removeQuery` | — | Set/overwrite query params, and/or drop named ones. |
| request | `redirect` | `to` | `status` (default 302) | Return a redirect and stop — the request is never proxied. Must be the rule's only op. |
| response | `set-header` | `name`, `value` | — | Set a response header on the way out. |
| response | `remove-header` | `name` | — | Strip a response header. |
| response | `set-status` | `status` (100–599) | — | Override the response status. |
| response | `cors` | `allowOrigins` | `allowMethods`, `allowHeaders`, `exposeHeaders`, `allowCredentials`, `maxAge` | Add CORS — including the OPTIONS preflight answer. Must be the rule's only op. |

A few details worth knowing:

- **`redirect`** — `to` is either a `/`-relative path or an absolute
  `http(s)://` URL. The one placeholder is **`$uri`**, replaced with the
  request's original path-and-query. `status` must be one of
  `301, 302, 303, 307, 308`. A redirect short-circuits the chain, so it must be
  the **only** operation in its rule.
- **`rewrite-path`** — give it exactly one of a literal `path` (must start with
  `/`) **or** a `regex` + `replace` pair. The `regex` is RE2 and is compiled and
  validated when you save, so a malformed pattern is rejected up front;
  `replace` supports `$1` / `${name}` backreferences.
- **`rewrite-query`** — `query` is a map of params to set or overwrite;
  `removeQuery` is a list of params to drop. Provide at least one.
- **`cors`** — authored as a response-phase rule (it's "about" response CORS
  headers), but the proxy mounts it as a request-spanning middleware so it can
  answer the OPTIONS **preflight** at request time. It must be the **only**
  operation in its rule. If `allowCredentials` is true, `allowOrigins` can't be
  `"*"` — browsers forbid wildcard-with-credentials. `maxAge`, if set, is a Go
  duration.

### Protected headers

Some header names can't be set or removed, because mutating them corrupts the
connection or forges identity:

- **Both phases** — the hop-by-hop and framing headers: `Connection`,
  `Keep-Alive`, `Transfer-Encoding`, `TE`, `Trailer`, `Upgrade`,
  `Proxy-Connection`, `Proxy-Authenticate`, `Proxy-Authorization`,
  `Content-Length`, and `Content-Encoding`.
- **Request phase, additionally** — `Host` (use the route
  [Host override](/networking/routes/#override-the-host-header) instead), the
  `X-Forwarded-*` trust chain, `X-Real-IP`, and the forward-auth identity headers
  (`X-Auth-Email`, `X-Auth-User`, and a route's `authResponseHeaders` names). A
  transform can't forge the client IP or the access identity that the Firewall,
  rate limiter, and your deployment trust.

A rule that touches a protected header is rejected as invalid.

## The filter expression

A rule's `filter` is a small boolean over the request — the **same expression
language as the [Firewall](/networking/waf/#the-expression-language)** and
[cache overrides](/networking/cache/#the-filter-expression): `request.path`,
`request.method`, `request.host`, `request.ip`, `request.headers['name']`, the
operators `==`, `!=`, `&&`, `||`, `!`, and the helpers `.startsWith(s)`,
`.endsWith(s)`, `.contains(s)`. An empty filter applies the rule to every
request.

```text
request.host == 'acme.com'
request.path.startsWith('/api/v1/')
request.headers['x-internal'].contains('yes') && request.method == 'GET'
```

The filter gates **request** attributes only — even on a response rule, it is
evaluated over the request (taken after the same zone's request-phase rules have
run). Filtering on the upstream's status or content type isn't supported yet.

{{< callout type="note" >}}
Filters are compiled at the proxy, not by the API. A filter that fails to
**compile** rejects the whole new set wholesale — the previous good set stays
live, so traffic never breaks on a typo. Only a runtime **eval** error skips that
one rule (it applies no mutation), which is the safe bias for a layer that
rewrites traffic.
{{< /callout >}}

## v1 and the edge cache

{{< callout type="warning" >}}
**Today, transforms run in-cluster, behind the edge cache — so response
transforms apply only on cache _misses_.** An edge cache **hit** is served
entirely at the edge and never reaches the transform layer.
{{< /callout >}}

The data path is two proxy hops: an **edge** proxy (Firewall + cache) in front,
and the **in-cluster** proxy (Firewall + rate limit + transform) behind it. The
edge forwards only cache misses inward. In this first release, transforms execute
in-cluster, which has two consequences:

- **Response transforms apply on misses, then bake into the cached object.** A
  header you inject on a miss is stored with the cached response and served on
  subsequent hits. But **editing or removing a response transform does not
  rewrite objects already in the cache** — they keep the old headers until they
  expire, or until you purge. Trigger an immediate update with
  [`domain.purgeCache`](/networking/domains/) (note it needs the separate
  `domain.purgecache` permission and runs **per domain**, so a project-wide
  change means one purge per custom domain).
- **Request rewrites don't change the edge cache key.** The edge computes its key
  from the original request before forwarding a miss inward, so an in-cluster
  `rewrite-path` or `rewrite-query` is invisible to the cache key. The same purge
  caveat applies to any request op whose effect shows up in a cached response
  (for example a `redirect` on an already-cached apex host).

Running transforms *in front of* the edge cache — so they apply on every hit and
miss with no purge needed — is planned, and will dissolve this caveat.

## Limits

| Limit | Value |
|---|---|
| Rules per zone | 100 |
| Operations per rule | 16 |
| Filter length | 2048 chars |
| Header value length | 2048 chars |

## Roll out safely

**Stage a new rule in shadow mode.** Set `"mode": "shadow"` and the proxy
compiles and counts the rule but applies none of its operations — the safe way to
confirm a filter matches what you expect before it starts mutating traffic. Clear
`mode` (or set `""`) once you're confident, and the rule enforces. It's the
transform equivalent of rolling out a Firewall rule as `log` before `block`.

## Permissions

Transforms have their own permission family, independent of `route.*` and
`waf.*`, so a platform team can manage them without owning routing or the
Firewall:

| Permission | Grants |
|---|---|
| `transform.get` | Read one zone. |
| `transform.list` | List the project's zones. |
| `transform.set` | Replace a zone's rule set. |
| `transform.delete` | Remove a zone. |
| `transform.*` | All of the above. |

{{< callout type="warning" >}}
**`transform.get` and `transform.list` are not public-bindable.** A `set-header`
operation can legitimately carry a credential (e.g.
`Authorization: Bearer …`), so a zone read is sensitive and can never be bound to
`allUsers` / `allAuthenticatedUsers`. (They remain delegatable to a scoped token,
which only ever attenuates an access the delegator already holds.)
{{< /callout >}}

## Examples

The CLI round-trips the zone as YAML — `get` it, edit, `set` it back. `-f` is
required so a bare `transform set` can't silently wipe a zone.

```bash
deploys transform get --project acme --location gke.cluster-rcf2 -oyaml > transform.yaml
# …edit transform.yaml…
deploys transform set --project acme --location gke.cluster-rcf2 -f transform.yaml
```

### Force `www` — a 301 redirect

A request-phase rule that redirects the apex host to `www` and short-circuits
before the request is ever proxied. The filter scopes it to the apex; `$uri`
carries the original path and query through.

```json
{
  "project": "acme",
  "location": "gke.cluster-rcf2",
  "description": "canonical host",
  "transforms": [
    {
      "id": "",
      "description": "force www",
      "phase": "request",
      "filter": "request.host == 'acme.com'",
      "ops": [
        { "type": "redirect", "to": "https://www.acme.com$uri", "status": 301 }
      ],
      "priority": 5
    }
  ]
}
```

```bash
curl https://api.deploys.app/transform.set \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d @transform.json
```

A request to `acme.com/pricing?ref=hn` matches the filter and is answered with a
`301` to `https://www.acme.com/pricing?ref=hn` — no upstream call. A request to
`www.acme.com/pricing` doesn't match, so it's proxied normally. Because v1 runs
behind the edge cache, the redirect fires on **misses**; if `acme.com` already
has cached `200`s, purge the edge cache (or wait out the TTL) for the redirect to
take effect on already-cached apex URLs.

### Security headers — HSTS and friends

A response-phase rule with no filter, so it applies to every response: inject
HSTS plus a couple of hardening headers, and strip the `X-Powered-By` leak.

```json
{
  "project": "acme",
  "location": "gke.cluster-rcf2",
  "description": "security baseline",
  "transforms": [
    {
      "id": "",
      "description": "hsts + security headers",
      "phase": "response",
      "ops": [
        { "type": "set-header", "name": "Strict-Transport-Security",
          "value": "max-age=63072000; includeSubDomains; preload" },
        { "type": "set-header", "name": "X-Content-Type-Options", "value": "nosniff" },
        { "type": "set-header", "name": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin" },
        { "type": "remove-header", "name": "X-Powered-By" }
      ],
      "priority": 10
    }
  ]
}
```

The operations apply in array order on the way out. On an edge cache miss the
headers are set on the response and then **baked into the cached object**, so a
later hit serves them without re-running the transform. Editing or removing the
rule does **not** retroactively rewrite already-cached objects — purge the edge
cache, or wait for the TTL, to apply the change immediately. (A rule trying to
`set-header Transfer-Encoding` would be rejected — it's on the protected-header
denylist.)
