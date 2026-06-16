---
title: 'Edge cache overrides'
linkTitle: 'Cache'
weight: 4
description: 'Force or bypass the edge response cache per request, by expression — without touching your origin.'
lead: 'Cache overrides steer the edge response cache for the requests you choose: force a caching policy onto an origin that does not send one, or bypass the cache for paths that must never be stored. Each override has a filter expression and an action — cache or bypass.'
---

{{< callout type="note" >}}
Cache overrides are currently in **preview** and roll out per location. The
console shows a "Preview" badge in the sidebar when they're available. A location
must have the **edge cache** enabled for overrides to take effect.
{{< /callout >}}

The edge cache is **honor-origin** by default: it caches a response only when
your origin opts in with explicit `Cache-Control` / `Expires` freshness, and it
never invents a TTL. That's the safe default, but it leaves two gaps you can't
always close from the origin — an origin you don't control (or one that forgot
its cache headers) is permanently uncacheable, and an origin that over-shares
(cacheable headers on a per-user path) can't be fenced off without a redeploy.
Cache overrides are the edge's escape hatch for both.

## The Cache page

The Cache tab lists every zone in the project (one per location), with its
status, override count, and a 24-hour decision sparkline so you can see how
busy the overrides have been.

{{< shot src="/img/cache-list.png" url="console.deploys.app/cache?project=acme" alt="Cache list showing a single active zone with 3 overrides and 732 decisions in 24h" caption="A single cache zone in gke.cluster-rcf2 — 3 overrides, 732 decisions in the last day." >}}

Click **Manage** to view, reorder, and edit the zone's overrides.

## How overrides work

Overrides match in priority order — top to bottom in the table. For caching
decisions the **first matching override wins**; a request that matches none is
handled by the honor-origin default.

| Action | Effect |
|---|---|
| **`cache`** | Force a caching policy onto the response — store it at the edge for the override's TTL, even if the origin didn't ask for it. |
| **`bypass`** | Skip the cache entirely for matching requests — always go to the origin, never store the response. A `bypass` always wins over a `cache` force. |

{{< shot src="/img/cache-manage.png" url="console.deploys.app/cache/manage?project=acme" alt="Manage page listing three overrides — a static-assets cache, an admin bypass, and a shadow-mode API trial" caption="The override list: force static assets, bypass /admin, and trial API caching in shadow mode." >}}

A `cache` override is described by a few fields:

```json
{
  "id": "static-assets",
  "description": "Force long-lived caching for static assets",
  "action": "cache",
  "filter": "request.path.startsWith('/static/')",
  "ttl": "1h",
  "policy": "balanced",
  "staleWhileRevalidate": "30s",
  "status": [200],
  "mode": "enforce",
  "priority": 0
}
```

- **`ttl`** — the forced freshness lifetime (a Go duration, `1s`..`720h`).
  Required for `cache`; not used for `bypass`.
- **`policy`** — how far the force reaches over the origin's `Cache-Control`:
  - `conservative` — only fill in missing freshness.
  - `balanced` (default) — force, but refuse to cache responses that look
    unsafe to share.
  - `aggressive` — override almost everything.
- **`staleWhileRevalidate` / `staleIfError`** — optional RFC 5861 windows: serve
  a stale response while revalidating in the background, or when the origin
  errors.
- **`status`** — optional; force only these origin response statuses (e.g.
  `[200, 301]`). Empty forces every cacheable status.
- **`priority`** — orders the `cache` rules against each other; the lowest number
  wins and declaration order breaks ties. `0` resolves to the default (`100`).
  `bypass` rules aren't ordered — a matching bypass always wins.
- **`mode`** — `enforce` (default) applies the override; `shadow` evaluates and
  counts it without changing caching. See [Roll out safely](#roll-out-safely).

## The filter expression

Override filters use the **same expression language as the [Firewall](../waf/)** —
small boolean expressions over `request.path`, `request.method`,
`request.host`, `request.headers['name']`, and the rest. An empty filter applies
the override to every request.

```text
request.path.startsWith('/static/')
request.path.startsWith('/api/') && request.method == 'GET'
request.host == 'cdn.example.com'
```

One difference from the Firewall: `request.body` is always empty in a cache
filter — caching decisions run before the request body is read.

## Roll out safely

{{< callout type="warning" >}}
**`aggressive` can leak between users.** It overrides the `Authorization` gate,
so an aggressive force on a per-user or authenticated path can cache one user's
response and serve it to another. Reserve `aggressive` for responses you are
certain are identical for everyone, and prefer scoping the filter tightly.
{{< /callout >}}

**Trial a force in shadow mode first.** Set `mode: shadow` and the override is
evaluated and counted on the metrics page but never actually changes caching.
Watch the `shadow` decisions for a day to confirm the filter matches what you
expect, then flip it to `enforce`.

```text
priority 0 — cache  — request.path.startsWith('/static/')  ttl 1h   (enforce)
priority 1 — bypass — request.path.startsWith('/admin')             (enforce)
priority 2 — cache  — request.path.startsWith('/api/')     ttl 5m   (shadow)
```

## Metrics

The Cache metrics page plots decisions per result — **applied**, **shadow**,
and **error** — over a selectable window (1h, 6h, 12h, 1d, 7d, 30d), with a
per-override breakdown so you can size a shadow override before enforcing it and
spot an override that suddenly starts (or stops) matching traffic.

{{< shot src="/img/cache-metrics.png" url="console.deploys.app/cache/metrics?project=acme" alt="Cache metrics page: applied/shadow/error tiles, a decisions-over-time chart, and a top-overrides table" caption="Decisions over time, split by result, with the busiest overrides ranked by volume." >}}

The same data is available via the API:

```bash
curl https://api.deploys.app/cache.metrics \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{ "project": "acme", "location": "gke.cluster-rcf2",
        "timeRange": "1d" }'
```
