---
title: 'Web Application Firewall'
linkTitle: 'Firewall (WAF)'
weight: 3
description: 'A rule-based firewall in front of your project — block, log, or allow by expression.'
lead: 'The Firewall is an ordered list of rules that run for every request matching a route in the project. Each rule has an expression and an action — block, log, or allow.'
---

{{< callout type="note" >}}
The Firewall is currently in **preview** and rolls out per location. The
console shows a "Preview" badge in the sidebar when it's available.
{{< /callout >}}

## The Firewall page

The Firewall tab lists every zone in the project (one per location), with its
status, description, rule count, and a 24-hour match sparkline so you can see
how busy each rule has been.

{{< shot src="/img/waf-list.png" url="console.deploys.app/waf?project=acme" alt="Firewall list showing a single active zone with 3 rules and 431 matches in 24h" caption="A single firewall zone in gke.cluster-rcf2 — 3 rules, 431 matches in the last day." >}}

Click **Manage** to view, edit, and reorder the zone's rules.

## How rules work

Rules evaluate in priority order — lowest priority number first. The first
rule whose expression matches the request decides the outcome:

| Action | Effect |
|---|---|
| **`block`** | Return the configured status (default 403) and stop. The request never reaches your deployment. |
| **`log`** | Record a match in metrics and continue evaluating later rules. |
| **`allow`** | Stop evaluating and forward the request to the deployment, bypassing later rules. |

A request that doesn't match any rule is forwarded normally.

```json
{
  "id": "block-admin",
  "description": "Block external access to /admin",
  "expression": "request.path.startsWith('/admin')",
  "action": "block",
  "status": 403,
  "message": "Forbidden",
  "priority": 10
}
```

## The expression language

Rule expressions are small boolean expressions over the request. Common
references:

- `request.path` — the URL path (string).
- `request.method` — `GET`, `POST`, …
- `request.remote_ip` — the client IP as seen by the gateway.
- `request.headers['name']` — a header value (string), lowercased name.
- `request.host` — the request hostname.

Operators: `==`, `!=`, `&&`, `||`, `!`, plus the string helpers
`.startsWith(s)`, `.endsWith(s)`, and `.contains(s)`.

```text
request.path.startsWith('/admin')
request.headers['user-agent'].contains('bot')
request.remote_ip == '203.0.113.7'
request.path.endsWith('.php') && !request.headers['x-internal'].contains('yes')
```

## Patterns

**Always allow your own egress IPs.** Stick an `allow` rule with low priority
at the top of the zone so good traffic short-circuits the rest of the rules.

```text
priority 10 — allow — request.remote_ip == '203.0.113.7'
priority 50 — block — request.path.startsWith('/admin')
priority 90 — log   — request.headers['user-agent'].contains('bot')
```

**Roll out new blocks safely.** Add a rule as `log` first, watch the matches
on the metrics page for a day, then flip it to `block` once you've confirmed
it's catching what you expect (and not what you don't).

## Test rules (dry run)

Before saving a rule — or before trusting a whole zone — you can ask the API
what the zone *would* do to a sample request. `waf.test` compiles your
expressions with the same engine the gateway runs, evaluates them against a
synthetic request you describe, and reports every rule's match, the winning
rule, and which rate limits the request would count against. Nothing is
stored and nothing reaches the cluster; it only needs the read-only `waf.get`
permission, and the zone doesn't have to exist yet — testing a draft before
the first `waf.set` is the point.

The console has a **Test** panel on the rule editor, the rate-limit editor,
and the zone manage page.

{{< shot src="/img/waf-test.png" url="console.deploys.app/waf/manage?project=acme" alt="Firewall Test panel showing a blocked dry run: outcome Blocked with status 403, per-rule matched badges, and rate-limit counting notes" caption="Dry-running GET /admin against the zone — block-admin matches and decides the outcome; a blocked request is never counted against the rate limits." >}}

There are two ways to call it:

| Mode | Send | Good for |
|---|---|---|
| **Expression** | `expression` — one CEL expression | Checking a single rule or limit filter while you write it |
| **Zone draft** | `rules` + `limits` — the same payload as `waf.set` | Dry-running a whole zone before (or after) saving it |

Send exactly one of the two. In expression mode the expression runs as a
single `log` rule with id `expression` — and since `log` never terminates,
the `outcome` is always `pass`; whether the expression matched is
`rules[0].matched`.

```bash
curl https://api.deploys.app/waf.test \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{ "project": "acme", "location": "gke.cluster-rcf2",
        "expression": "request.country == \"TH\" && request.path.startsWith(\"/admin\")",
        "request": { "method": "GET", "path": "/admin",
                     "host": "app.example.com",
                     "ip": "203.0.113.7", "country": "TH" } }'
```

The sample `request` describes the synthetic request: `method` (default
`GET`), `path` (required), `query`, `host`, `scheme` (default `https`),
`headers` and `cookies` maps, `ip`, `country`, and `asn`.

{{< callout type="note" >}}
`country` and `asn` are **simulation inputs, supplied by you** — the API does
no GeoIP lookup. In production the gateway resolves them from the client IP
at the edge; in a dry run, whatever you put in `country`/`asn` is what
`request.country`/`request.asn` will contain (leave them empty/zero to
simulate an unresolved lookup).
{{< /callout >}}

The result reports:

| Field | Meaning |
|---|---|
| `outcome` | `pass`, `allow`, or `block` — the zone's terminal decision. |
| `winningRuleId` | The rule that decided the outcome (empty on `pass`). |
| `status` / `message` | The block response (403 / `Forbidden` by default); only set on `block`. |
| `rules[]` | Every rule in evaluation order, with `matched`, `evaluated`, `terminal`, and a per-rule `error`. |
| `limits[]` | Every rate limit, with `filterMatched` and `counted` (see below). |
| `valid` | `false` when any expression failed to compile — the same draft would be rejected by `waf.set`. |

Every rule is evaluated independently, so `matched` is reported even for
rules *after* the winning allow/block; those come back with
`evaluated: false` because the real engine short-circuits there. A rule that
errors at runtime gets its `error` set and is skipped in the decision walk —
the same fail-open behavior as production. A rule that fails to *compile* is
likewise reported per-rule and skipped, but only in the dry run: production
never runs a compile-broken rule at all, because `waf.set` rejects the save
(that's what `valid: false` tells you). Either way the rest of the zone keeps
evaluating, so one broken expression doesn't hide the results for everything
else.

For each rate limit, `filterMatched` means the limit's filter selects this
request (always true for a limit with no filter), and `counted` means the
request would actually be counted against the limit — a request blocked by a
rule never reaches the rate limiter, so it burns no rate budget. Neither
means the request would be *limited*: that depends on live counters, which a
dry run can't know.

{{< callout type="warning" >}}
The dry run simulates **your zone, assuming the request reaches it**. A few
things it cannot reproduce:

- The platform's global baseline rules and the managed WAF layer run before
  your zone and are not simulated — either can block a real request before
  your rules ever see it.
- The synthetic request has no body: `request.body` is always `""` and
  `request.content_length` is always `0`.
- `request.proto` is always `"HTTP/1.1"`; production HTTP/2 traffic reports
  `"HTTP/2.0"`, so expressions on `request.proto` can't be faithfully
  simulated.
- The dry run budgets its evaluation time per expression, while production
  budgets one small window for the whole ruleset walk — a very heavy zone
  (many complex regexes) can fully match in a dry run yet time out mid-walk
  in production, fail-open skipping the remaining rules.
{{< /callout >}}

## Rate limiting

Alongside the block/log/allow rules, a zone can carry **rate limits** — counters
that reject (or just watch) traffic arriving faster than a threshold. Limits are
independent of the rules: they're evaluated for every request the zone covers,
so a request that passes every rule can still be rejected by a limit.

A limit sorts requests into **buckets** and rejects a bucket once it exceeds
`rate` requests per `window`. What defines a bucket is the `key`:

| Key | One bucket per |
|---|---|
| `ip` | client IP (the default) |
| `host` | request hostname |
| `asn` | client network (autonomous system number) |
| `country` | client country |
| `header:<name>` | value of a request header |
| `cookie:<name>` | value of a cookie |

List several to bucket on the combination — `["ip", "host"]` limits each IP
*per host*. With no key the limit defaults to `["ip"]`.

Limits live on the same zone as the rules. Set them with `waf.set`, in a
`limits` array next to `rules` — and, like the rules, `waf.set` replaces the
whole zone, so send the full `limits` list every time:

```json
"limits": [
  {
    "description": "100 req/min per IP",
    "key": ["ip"],
    "rate": 100,
    "window": "1m"
  },
  {
    "description": "Throttle login to slow credential stuffing",
    "key": ["ip"],
    "rate": 5,
    "window": "1m",
    "filter": "request.path == '/login' && request.method == 'POST'",
    "status": 429,
    "message": "Too many attempts — slow down."
  }
]
```

Each limit understands:

| Field | | Meaning |
|---|---|---|
| `rate` | required | Max requests per `window` per bucket (> 0). |
| `window` | required | Go duration, `1s`–`1h` (e.g. `30s`, `1m`, `1h`). |
| `key` | optional | Bucket characteristics (above); default `["ip"]`. |
| `algorithm` | optional | `fixed` (default) fixed window, or `sliding` for a smoother rolling window. |
| `mode` | optional | `enforce` (default) rejects; `shadow` only counts — see below. |
| `status` | optional | Response status when limited: `429` (default) or `503`. |
| `message` | optional | Response body when limited (default `Too Many Requests`). |
| `filter` | optional | A CEL expression (the same `request.*` surface as rule expressions) scoping the limit to matching requests; empty means every request. A filter that errors at runtime fails *open* — the limit is skipped — so a bad filter can't reject good traffic. |

A zone holds up to 20 limits.

**Size a limit in shadow mode first.** Set `"mode": "shadow"` and the limit
counts matches without rejecting anything. Watch the limited share on the metrics
page for a day or two, confirm the threshold only catches abuse, then flip it to
`enforce`. It's the rate-limit equivalent of rolling out a rule as `log` before
`block`.

## Metrics

The Firewall metrics page plots matches per (rule, action) over a selectable
window — 1h, 6h, 12h, 1d, 7d, 30d — so you can see which rules are hot and
catch rule changes that suddenly start matching production traffic.

The same data is available via the API:

```bash
curl https://api.deploys.app/waf.metrics \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{ "project": "acme", "location": "gke.cluster-rcf2",
        "timeRange": "1d" }'
```

Rate limits have their own series via `waf.limitMetrics`, returned per
(limit, result) where `result` is `allowed` or `limited`. Charting the limited
share — `limited / (allowed + limited)` — is how you size a `shadow` limit
before enforcing it.

```bash
curl https://api.deploys.app/waf.limitMetrics \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{ "project": "acme", "location": "gke.cluster-rcf2",
        "timeRange": "1d" }'
```
