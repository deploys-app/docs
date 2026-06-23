---
title: 'Audit log'
linkTitle: 'Audit log'
weight: 6
description: 'Who did what, when. Filterable by resource, actor, outcome, and time range.'
lead: 'Every state-changing API call that passes authorization lands in the audit log — actor, action, resource, outcome, and timestamp. Use it to answer "who deployed that?" and "which writes failed?"'
---

## What gets logged

Every call that creates, updates, or deletes a resource — a deploy, a rollback,
a domain create, a route delete, a role grant, a service-account key create, and
so on — is recorded once it passes authorization. Read-only calls (`*.list`,
`*.get`, `*.metrics`) are not.

{{< callout type="note" >}}
**Permission denials are not logged.** A call rejected by the permission check
returns before the write is attempted, so it never reaches the audit log. The
log records *authorized* writes — the ones that ran — not access attempts. To
reason about who *can* do what, use [roles](/access/roles/), not the audit log.
{{< /callout >}}

Each entry captures:

- **Actor** — the principal who made the call (user email or service-account
  email), plus their type (`User` or `ServiceAccount`). When the call was made
  through a [scoped token](/access/scoped-tokens/), the actor stays the human or
  service account that *minted* it, and the token's `label` rides alongside as
  the **agent** tag — so an agent session is attributable without ever losing the
  principal behind it.
- **Channel** — the client surface the call came through: `console`, `cli`,
  `mcp`, or `api` (a direct API call). Self-reported by the client and defaults
  to `api` when unset, so treat it as a hint about *how* a change was made, not
  as a security signal — the **actor** is the authoritative identity.
- **Action** — the verb that ran: `deploy`, `create`, `delete`, `rollback`,
  `grant`, `revoke`, and so on.
- **Resource** — the `type` (`deployment`, `domain`, `role`, …, lowercase), plus
  the id, name, and location of the affected resource.
- **Outcome** — `success` or `failure`. A `failure` is an authorized call that
  *ran but errored* — a validation error, a conflict, a downstream failure — not
  a permission denial.
- **Detail** — a short human-readable summary (e.g. *"revision 7"*).
- **Created at** — when the call happened, in UTC.

## Filter and browse

The Audit Logs page lets you narrow by:

- **Resource type** — Deployment, Domain, Route, Disk, Role, ServiceAccount, …
- **Channel** — api, console, cli, or mcp.
- **Outcome** — success or failure.
- **Date range** — today, last 7 days, last 30 days, last 90 days, last year,
  or a custom range.

The `auditLog.list` function takes the same filters — plus an `actor` filter the
console doesn't expose — and a `limit`. `resourceType`, `channel`, and `outcome`
match exactly, and the resource type is **lowercase** (`deployment`, not
`Deployment`). The time window is `after` / `before` (RFC 3339). There is no
`action` filter — narrow by `resourceType`, then read the `action` field on each
entry.

```bash
curl https://api.deploys.app/auditLog.list \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{
    "project": "acme",
    "resourceType": "deployment",
    "outcome": "success",
    "after": "2026-05-01T00:00:00Z",
    "before": "2026-06-01T00:00:00Z",
    "limit": 200
  }'
```

The response is a list of entries you can sift through or pipe through `jq` for
ad-hoc analysis.

## Common queries

- **"Who deployed the bad release?"** — filter by `deployment` resource type and
  the rough time window, then look for `action: "deploy"`. The actor on the
  matching entry is your culprit (or your hero).
- **"Which writes failed?"** — outcome `failure`. These are calls that were
  *allowed* but errored while running — a bad request body, a name conflict, a
  downstream failure — so it's a debugging aid for automation, not a record of
  blocked access.
- **"What did the CI service account touch yesterday?"** — set `actor` to the
  service-account email plus an `after` / `before` window (the console doesn't
  expose the actor filter directly).
- **"What was changed through the CLI (or the MCP server)?"** — set `channel` to
  `cli` or `mcp` to separate automation-surface writes from console clicks and
  direct API calls.

## Retention

Entries are kept for **one year** after they're written, then purged
automatically by the database's row-level TTL — no action needed on your part.
Deleting a resource doesn't remove its existing audit history; the entries age
out on the same one-year clock.

## Streaming to your SIEM

Two patterns work well:

- **Pull periodically.** A small service account with `auditLog.list` polls
  every few minutes for new entries (filter by `after` ≥ last-seen
  `createdAt`) and forwards to your aggregator.
- **Pull at quarter-of-the-hour cadence** if you only need rough
  near-real-time. Run a cron deployment with `--type CronJob` and
  `0,15,30,45 * * * *` doing the same pull.

The audit log isn't push-based today — pull is the only mode.
