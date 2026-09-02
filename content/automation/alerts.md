---
title: 'Metric alerts'
linkTitle: 'Alerts'
weight: 7
description: 'Get paged when a deployment''s CPU, memory, request rate, or egress crosses a threshold for a sustained window — delivered through your existing notification channels.'
lead: 'An alert rule watches one metric on one deployment and fires when it stays past a threshold for a set number of minutes. Rules are evaluated by the platform every minute — there is nothing to host or poll — and notify through the same webhook, Discord, or pull channels as every other change. Rules are project-scoped and run on Deploys.app.'
---

## What you get

- **Threshold rules** — condition on `cpu`, `memory`, `requests`, or `egress` for
  a deployment: metric, comparison, threshold, and how long it must hold.
- **Rolling-window evaluation** — a rule fires only once the condition has held
  for its window, not on a single noisy sample.
- **Three states** — `ok`, `firing`, or `nodata`, so a missing deployment or a
  gap in metrics is never confused with a real breach.
- **Renotify** — get pinged again on a schedule while a rule is still firing,
  not just once.
- **Delivery via notification channels** — no separate delivery config; wire a
  channel to `alert.trigger` / `alert.resolve` like any other event.
- **30-day event history** — every state transition is recorded for the detail
  page.

## Create a rule

From the console, open **Alerts** and click **Create rule**. Or use the CLI:

```bash
deploys alert create \
  --project acme \
  --name web-cpu-high \
  --location gke.cluster-rcf2 \
  --deployment web \
  --metric cpu \
  --op ">=" \
  --threshold 90 \
  --for 10 \
  --renotify 60
```

This watches the `web` deployment's CPU usage and fires once every present
one-minute sample in a **10-minute window** is **≥ 90% of its limit**,
re-notifying every 60 minutes while it stays firing. A missed collector
minute is tolerated — see [When a rule fires](#when-a-rule-fires).

### Fields

| Field | Description |
|---|---|
| **Name** | A project-unique name (lowercase, e.g. `web-cpu-high`). |
| **Location** | The location the target deployment runs in. |
| **Deployment** | The deployment name to watch. |
| **Metric** | `cpu`, `memory`, `requests`, or `egress` — see [Metric vocabulary](#metric-vocabulary). |
| **Operator** | `>=` or `<=`. Defaults to `>=`. |
| **Threshold** | The value the metric must cross. Unit depends on the metric. |
| **For** | How many minutes (1–60) the condition must hold, evaluated as a rolling window — see [When a rule fires](#when-a-rule-fires). |
| **Renotify** | Re-send `alert.trigger` every N minutes while still firing. `0` disables it (notify only on transitions) — see [Renotify](#renotify). |
| **Disabled** | A disabled rule keeps its config but stops evaluating. Saving any edit — including disabling — resets the rule's status to `ok`, so it starts fresh when re-enabled. |

## Metric vocabulary

| `Metric` | Meaning | Threshold unit | Bucket aggregation |
|---|---|---|---|
| `cpu` | CPU usage as a share of the deployment's limit, averaged across pods | percent (may exceed 100%, up to 1000, since limits can be briefly overcommitted) | avg per minute |
| `memory` | Memory usage as a share of the deployment's limit, averaged across pods | percent (same headroom as `cpu`) | avg per minute |
| `requests` | Request rate, summed across pods | requests/min | sum per minute |
| `egress` | Egress traffic, summed across pods | bytes/min | sum per minute |

`cpu` and `memory` are computed the same way the Metric tab's chart lines are —
`avg(usage) / avg(limit)` per one-minute bucket — so the threshold you set lines
up visually with what you see on the [metrics chart](/deployments/monitoring/).

{{< callout type="note" >}}
A deployment with no resource limit set produces no `cpu`/`memory` percentage to
evaluate — a `cpu` or `memory` rule on it reports `nodata`, not a breach. "90% of
nothing" isn't a meaningful comparison; set a limit on the deployment if you want
to alert on it.
{{< /callout >}}

## When a rule fires

A rule evaluates every minute over a **rolling window** of the last `for`
minutes, not a single instant:

- **firing** — every one-minute bucket present in the window satisfies the
  condition (`metric <op> threshold`), **and** at least 80% of the expected
  buckets are present (rounded up). A single missed collector minute doesn't
  reset the clock.
- **nodata** — fewer than 20% of the expected buckets are present (rounded
  up) — the deployment is stopped, deleted, or (for `cpu`/`memory`) has no
  limit set.
- **ok** — otherwise.

`nodata` never fires and never resolves an active alert: a rule that's already
`firing` stays `firing` through a data gap, and only clears once the metric is
genuinely back under (or over, for `<=`) the threshold. This keeps "no data"
and "deployment is down" — which is [`deployment.health`](/automation/notification-channels/)'s
job — from double-paging the same incident, and keeps a flaky collector minute
from silently clearing a real one.

Because evaluation is windowed, resolving a firing alert takes one extra tick
after the first good minute enters the window. The rule then stays `ok` until
the window is once again a quorum of breaching buckets, so a single clean
sample doesn't flap it straight back to firing.

## Status

| Status | Meaning |
|---|---|
| `ok` | The condition is not currently met. |
| `firing` | The condition has held for the full window. An `alert.trigger` notification went out on the transition into this state (and again on renotify). |
| `nodata` | Not enough recent data to evaluate — the deployment is stopped or deleted, or (for `cpu`/`memory`) has no limit set. Does not notify, and does not resolve an active `firing` alert. |

The console list and detail pages show a rule's current status, last evaluated
value, and — while firing — how long it's been firing. From the CLI:

```bash
deploys alert list --project acme
deploys alert get  --project acme --name web-cpu-high
```

## Renotify

By default (`renotify: 0`) a rule notifies only on **transitions** — the
moment it starts firing and the moment it resolves — and stays quiet in
between, however long the incident runs. Set `--renotify` to a number of
minutes (10–1440) to also re-send `alert.trigger` on that cadence while the
rule is still firing, for teams that want a periodic reminder rather than a
single page.

```bash
# re-notify every 30 minutes while firing
deploys alert update --project acme --name web-cpu-high --renotify 30

# transitions only
deploys alert update --project acme --name web-cpu-high --renotify 0
```

## Delivery: `alert.trigger` and `alert.resolve`

An alert rule carries no delivery config of its own — it reuses
[notification channels](/automation/notification-channels/) entirely. Subscribe
a channel to `alert.trigger` and `alert.resolve` (or `alert.*` to also see rule
config changes, since create/update/delete on a rule are ordinary audited
changes like any other resource):

```bash
deploys notification create --project acme --name alerts-discord \
  --type discord \
  --url https://discord.com/api/webhooks/123/abc \
  --event alert.trigger --event alert.resolve
```

- `alert.trigger` carries outcome **`failure`** (red in Discord).
- `alert.resolve` carries outcome **`success`** (green in Discord).
- The `message` is a one-line summary of the condition and the value that
  crossed it, e.g.:

  ```
  web: cpu >= 90% for 10m (current 94.2%)
  ```

{{< callout type="note" >}}
A rule with no channel subscribed still evaluates and still shows `firing` in
the console — it just has nowhere to send the notification. Wire up a channel
before relying on a rule to page you; the create form warns if your project has
no notification channels yet.
{{< /callout >}}

## History

Every state transition (`trigger`, `resolve`, and each `renotify`) is recorded
with its value, kept for **30 days**, and shown on the rule's detail page
alongside a link to the deployment's metrics chart:

```bash
deploys alert events --project acme --name web-cpu-high --limit 50
```

## Limits

| Limit | Value |
|---|---|
| Rules per project | 20 |
| `for` (minutes) | 1–60 |
| Renotify (minutes) | `0` (disabled) or 10–1440 |
| Event history | 30 days |

## Using the API directly

Every console action and CLI command is a thin wrapper over the API:
`alert.create`, `alert.update`, `alert.get`, `alert.list`, `alert.delete`, and
`alert.events` (recent transitions). These are also exposed to AI assistants
through the [MCP server](/automation/mcp/).

## Permissions

| Action | Permission |
|---|---|
| Create | `alert.create` |
| Edit | `alert.update` |
| View / list / events | `alert.get` / `alert.list` |
| Delete | `alert.delete` |

Grant these on a [role](/access/roles/) like any other permission. An alert
rule's config carries nothing sensitive, so unlike notification channels,
`alert.get` / `alert.list` are grantable to public principals (`allUsers` /
`allAuthenticatedUsers`) like most read permissions.
