---
title: 'Audit log'
linkTitle: 'Audit log'
weight: 5
description: 'Who did what, when. Filterable by resource, outcome, and time range.'
lead: 'Every state-changing API call lands in the audit log — actor, action, resource, outcome, and timestamp. Use it to answer "who deployed that?" and "what was tried but blocked?"'
---

## What gets logged

Every call that creates, updates, or deletes a resource — `deployment.deploy`,
`deployment.rollback`, `domain.create`, `route.delete`, `role.bind`,
`serviceAccount.createKey`, and so on — is recorded. Read-only calls
(`*.list`, `*.get`, `*.metrics`) are not.

Each entry captures:

- **Actor** — the principal who made the call (user email or service-account
  email), plus their type.
- **Action** — the API function name, e.g. `deployment.deploy`.
- **Resource** — the type, ID, name, and location of the affected resource.
- **Outcome** — `success`, `forbidden`, or `error`.
- **Detail** — a short human-readable summary (e.g. *"Deployed revision 7"*).
- **Created at** — when the call happened, in UTC.

## Filter and browse

The Audit Logs page lets you narrow by:

- **Resource type** — Deployment, Domain, Route, Disk, Role, ServiceAccount, …
- **Outcome** — success, forbidden, error.
- **Date range** — today, last 7 days, last 30 days, last 90 days, last year,
  or a custom range.

The same filters are available on the API:

```bash
curl https://api.deploys.app/auditLog.list \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{
    "project": "acme",
    "resourceType": "Deployment",
    "outcome": "success",
    "from": "2026-05-01T00:00:00Z",
    "to": "2026-06-01T00:00:00Z"
  }'
```

The response is a paginated list of entries you can sift through or pipe
through `jq` for ad-hoc analysis.

## Common queries

- **"Who deployed the bad release?"** — filter by `Deployment` resource type,
  action `deployment.deploy`, and the rough time window. The actor on the
  matching entry is your culprit (or your hero).
- **"What was blocked?"** — outcome `forbidden`. Useful when adjusting
  [roles](/access/roles/) — a string of failures usually means someone needs a
  permission you forgot to add.
- **"What did the CI service account touch yesterday?"** — set the actor email
  on the API call (the console doesn't expose this filter directly).

## Retention

Entries are retained for the lifetime of the project. Deleting a resource
doesn't delete its audit history; deleting the *project* eventually purges
it, but a record of project deletion itself is retained.

## Streaming to your SIEM

Two patterns work well:

- **Pull periodically.** A small service account with `auditLog.list` polls
  every few minutes for new entries (filter by `from` ≥ last-seen
  `createdAt`) and forwards to your aggregator.
- **Pull at quarter-of-the-hour cadence** if you only need rough
  near-real-time. Run a cron deployment with `--type CronJob` and
  `0,15,30,45 * * * *` doing the same pull.

The audit log isn't push-based today — pull is the only mode.
