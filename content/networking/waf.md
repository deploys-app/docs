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
- `request.ip` — the client IP as seen by the gateway.
- `request.headers['name']` — a header value (string), lowercased name.
- `request.host` — the request hostname.

Operators: `==`, `!=`, `&&`, `||`, `!`, plus the string helpers
`.startsWith(s)`, `.endsWith(s)`, and `.contains(s)`.

```text
request.path.startsWith('/admin')
request.headers['user-agent'].contains('bot')
request.ip == '203.0.113.7'
request.path.endsWith('.php') && !request.headers['x-internal'].contains('yes')
```

## Patterns

**Always allow your own egress IPs.** Stick an `allow` rule with low priority
at the top of the zone so good traffic short-circuits the rest of the rules.

```text
priority 10 — allow — request.ip == '203.0.113.7'
priority 50 — block — request.path.startsWith('/admin')
priority 90 — log   — request.headers['user-agent'].contains('bot')
```

**Roll out new blocks safely.** Add a rule as `log` first, watch the matches
on the metrics page for a day, then flip it to `block` once you've confirmed
it's catching what you expect (and not what you don't).

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
