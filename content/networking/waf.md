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
`.startsWith(s)`, `.endsWith(s)`, and `.contains(s)`, and
`ipInCidr(ip, cidr)` for network matching.

```text
request.path.startsWith('/admin')
request.headers['user-agent'].contains('bot')
request.remote_ip == '203.0.113.7'
ipInCidr(request.remote_ip, '203.0.113.0/24')
request.path.endsWith('.php') && !request.headers['x-internal'].contains('yes')
```

One more is available on top of the engine's own functions:
`ipInList(request.remote_ip, "list-name")` matches against a
[named IP list](#named-ip-lists) — it's a platform macro, expanded into
`ipInCidr` checks before your rules reach the gateway.

## Patterns

**Always allow your own egress IPs.** Stick an `allow` rule with low priority
at the top of the zone so good traffic short-circuits the rest of the rules.

```text
priority 10 — allow — ipInList(request.remote_ip, "office-ips")
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

## Named IP lists

Writing the same CIDRs into every rule gets old fast — and with the 2048-char
expression cap, a block list of more than ~40 networks doesn't fit in one rule
at all. **Named IP lists** are reusable sets of IPs and CIDRs, defined once per
project and referenced from any rule expression or limit filter in any of the
project's zones. Edit the list, and every zone that uses it is re-applied.

Typical uses: an office/VPN allowlist shared across every location, a botnet
block list too big for an inline expression, or exempting your monitoring
ranges from a rate limit.

Lists have their own permission family — `wafList.list`, `wafList.get`,
`wafList.set`, `wafList.delete` (camelCase, unlike most permissions) — which an
existing `waf.*` grant does **not** cover. Grant `wafList.*` alongside `waf.*`
for [roles](/access/roles/#custom-roles) that manage the firewall, or the
lists page and the list picker stay permission-blocked.

### Creating a list

In the console, the **IP lists** button on the Firewall page opens the lists
page — a table of the project's lists with entry counts and the zones
referencing each, plus create/edit and delete. The same operations via the CLI:

```bash
deploys wafList set \
  --project acme \
  --name office-ips \
  --entry 203.0.113.0/24 \
  --entry 198.51.100.7 \
  --entry 2001:db8::/48
```

Entries are IPv4/IPv6 addresses or CIDRs, mixed freely. `set` replaces the
whole list (like `waf.set` replaces the whole zone), so send every entry each
time. For longer lists, `--entries-file ips.txt` reads one entry per line
(`#` comments are stripped), and `-f list.yaml` takes the full payload as YAML.

```bash
deploys wafList list --project acme
deploys wafList get --project acme --name office-ips
deploys wafList delete --project acme --name office-ips
```

Entries are normalized on save: CIDRs are masked to their network address
(`10.1.2.3/8` stores as `10.0.0.0/8`) and IPv6 is compressed to canonical form.
Duplicates after normalization are rejected.

### Referencing a list

Use `ipInList(<field>, "<list-name>")` anywhere a rule expression or limit
filter goes. The list name must be double-quoted; negate with `!` like any
other boolean:

```json
"rules": [
  {
    "description": "office allowlist",
    "expression": "ipInList(request.remote_ip, \"office-ips\")",
    "action": "allow"
  }
],
"limits": [
  {
    "description": "api limit",
    "key": ["ip"],
    "rate": 600,
    "window": "1m",
    "filter": "!ipInList(request.remote_ip, \"office-ips\")"
  }
]
```

In the console, the rule and limit builders offer **in IP list** / **not in
IP list** operators with a picker over the project's lists.

`waf.set` rejects an expression referencing a list that doesn't exist, so
create the list first.

### How expansion works

`ipInList` is a *platform* macro, not an engine function. Your zone stores
exactly what you wrote — `waf.get` and the console round-trip the macro form —
and the platform expands it into plain `ipInCidr` checks when it applies the
zone to a location:

```text
ipInList(request.remote_ip, "office-ips")
   ↓
(ipInCidr(request.remote_ip, "203.0.113.0/24") || ipInCidr(request.remote_ip, "198.51.100.7/32") || ipInCidr(request.remote_ip, "2001:db8::/48"))
```

Bare addresses expand as exact matches (`/32` for IPv4, `/128` for IPv6). An
**empty list never matches** — `ipInList` over it is simply `false` — so a
freshly created placeholder list is safe to reference from either an `allow`
or a `block` rule.

Editing a list re-applies every zone that references it, in every location —
watch the zones flip to *Pending* and back to *Success* on the Firewall page.
A list edit that would push any referencing zone past the expansion caps
(below) is rejected whole, naming the offending zone and rule, and nothing
changes anywhere.

### Caps

| Limit | Value |
|---|---|
| List name | 3–26 chars; lowercase letters, digits, and hyphens, starting with a letter and ending with a letter or digit |
| Lists per project | 20 |
| Entries per list | 1000 |
| Entry length | 64 chars |
| Expanded expression size | 64 KiB |
| Expanded ruleset size (rules and limits, each) | 512 KiB |

The stored expression cap (2048 chars) applies to what you write — a macro
reference is ~45 chars, so list size no longer pushes against it. The expanded
caps apply to what the gateway runs, and they're checked on both `waf.set` and
`wafList.set`: whichever edit would exceed them is rejected with the rule or
limit named by its `description`. In practice a full 1000-entry IPv4 list fits;
IPv6-heavy lists hit the expression cap earlier.

{{< callout type="note" >}}
Every entry is one `ipInCidr` check at request time. That's cheap, but not
free — prefer one `ipInList` per rule over stacking many, and keep lists on
hot paths lean. Self-hosted gateways: the entry cap assumes
`WAF_COST_LIMIT >= 10000`.
{{< /callout >}}

### Deleting a list

Deleting a list that's still referenced is refused, and the error names every
referent — the location of each zone and the descriptions of the referencing
rules and limits:

```text
waf list "office-ips" is in use by the waf zone at gke.cluster-rcf2 (rules: "office allowlist"; limits: "api limit")
```

Remove or rewrite those rules first, then delete. There's no rename — the name
is the reference key — so renaming is delete + recreate, which the same guard
keeps honest.

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

## Firewall events

Metrics tell you *how often* a rule fired; events show you *what it caught*.
The metrics page keeps a table of recent match samples under the charts — each
row is one concrete request a rule matched: the time, the action taken, the
rule, the client IP and its country, and the request method, host, and path. That's usually enough to go from "this
rule matched 4,000 times" to "it's blocking `POST /wp-login.php` from one
network" without any log access.

<!-- TODO(screenshot): once the console's events section is merged, run
     scripts/screenshots/refresh.sh (capture.mjs already has the waf-events
     entry) and replace this whole comment with the shot line below — also
     removing the /* and */ markers, which only stop Hugo from executing the
     shortcode while it sits inside this comment:
{{</* shot src="/img/waf-events.png" url="console.deploys.app/waf/metrics?project=acme" alt="Recent events table listing sampled firewall matches with time, action, rule, IP, country, method, host, and path" caption="Recent events — sampled matches under the metrics charts, filterable by rule and action." */>}}
-->

Filter the table by rule or by action (`block`, `log`, `allow`), and page
back through history with **Load more**.

### Sampling and retention

Events are **samples, not a request log**. Each ingress instance keeps at
most **10 events per minute per rule** — blocked requests are exempt from
that per-rule cap, since blocks are what you came to inspect — and at most
**60 events per minute per firewall zone**, which bounds everything,
blocks included. Under a flood you still get enough examples to recognize
the pattern (same IP? same path? same country?) without recording every
request.

Because events are sampled, **never count them** — the metrics charts above
count every match and remain the source of truth; events are the examples.

Events are kept for **3 days**, then deleted.

{{< callout type="note" >}}
**Privacy.** An event carries the client IP, which is personal data. That is
why retention is deliberately short — 3 days, versus 30 for the anonymous
match counters — and why events never include query strings, request headers,
cookies, or bodies: only the method, host, and path are recorded.
{{< /callout >}}

### API and CLI

The table is served by `waf.events` — newest first, with optional `ruleId`
and `action` filters:

```bash
curl https://api.deploys.app/waf.events \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{ "project": "acme", "location": "gke.cluster-rcf2",
        "action": "block" }'
```

The result carries up to `limit` items (default 50, max 200) and a `next`
cursor; pass it back as `before` to fetch the next page, until `next` comes
back empty.

The same data from the CLI:

```bash
deploys waf events --project acme --location gke.cluster-rcf2
```
