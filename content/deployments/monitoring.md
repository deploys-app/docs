---
title: 'Monitoring & debugging'
linkTitle: 'Monitoring & debugging'
weight: 8
description: 'Metrics, logs, and Kubernetes events for diagnosing live deployments.'
lead: 'Every deployment has a dashboard with the three signals you reach for when something is off — usage charts, log output, and the underlying cluster events.'
---

## Metrics

The Metric tab plots CPU, memory, replicas, request count, and egress for the
deployment. Both **usage** and **allocated** (request) lines are shown — the
gap between them tells you whether you're under- or over-provisioned. The
Replicas chart is available replica count (HPA scale, crash-loop drop); it is
hidden for Static and CronJob deployments, which have no k8s Deployment.
The time-range selector spans **1 hour aggregate**, **1 day**, **7 days**, and
**30 days**.

{{< shot src="/img/deployment-metrics.png" url="console.deploys.app/deployment/metrics?project=acme&location=gke.cluster-rcf2&name=web" alt="Live CPU, memory, request rate, and egress charts for the web deployment" caption="Solid lines are real usage; dashed lines are the request you've allocated." >}}

Metrics are also available from the API as time-series:

```bash
curl https://api.deploys.app/deployment.metrics \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{ "project": "acme", "location": "gke.cluster-rcf2",
        "name": "web", "timeRange": "1d" }'
```

The response is a set of named series, one per metric, each a list of
`[unixSeconds, value]` points.

## Logs

The Logs tab streams the deployment's `stdout` and `stderr`. Hit **Stream Raw
Logs** to switch to a continuous follower (the default view is bounded to
the recent buffer). All replicas are interleaved — each line is prefixed with
its pod name so you can tell them apart.

Things to know:

- Logs are not retained indefinitely. Persist anything you care about long-term
  by shipping it to your own log aggregator (the platform doesn't ingest them
  for you).
- High-volume log output (thousands of lines per second) can be sampled. Keep
  log lines short; bury big payloads in your aggregator instead.
- Stack traces in your output are also mined into grouped, deduplicated
  **issues** — see [application error detection](/deployments/error-detection/).

## Kubernetes events

The Events tab shows the cluster events behind the deployment — image-pull
failures, OOM-kills, scheduling delays, readiness check fails. This is the
first place to look when a deploy gets stuck "Pending."

Common patterns:

- **`ImagePullBackOff`** — the image isn't reachable. Check the image name and
  digest, and confirm the [pull secret](/registry/pull-secrets/) if it's a
  private registry.
- **`OOMKilled`** — your container exceeded its memory limit. Raise
  `resources.limits.memory` or fix the leak.
- **`Insufficient cpu` / `Insufficient memory`** — the cluster can't schedule
  the requested resources right now. Lower the request or pick a different
  location.

## What runs where

Everything you see in the dashboard is computed from data the platform
collects passively — there's nothing to instrument inside your container.

| Signal | Source |
|---|---|
| CPU / memory usage | Pod cgroups, scraped at 60 s intervals |
| Replicas | kube-state-metrics available replica count, scraped at 60 s |
| Request rate / egress | The ingress and routing layer |
| Logs | Container `stdout` / `stderr`, streamed via the events channel |
| Events | Native Kubernetes events for the deployment's pods |

## Alerting

The platform ships its own metric alert rules — set a threshold on CPU,
memory, request rate, or egress, and get notified once it holds for a
sustained window, delivered through your existing
[notification channels](/automation/notification-channels/) (webhook, Discord,
or pull). See [Alerts](/automation/alerts/) to set one up.

For anything beyond that — longer-range analysis, cross-service correlation,
or a monitoring stack you already run — poll `deployment.metrics` from your
own system (Grafana, Datadog, Honeycomb, …) and define alerts there; it's the
same underlying time-series both the dashboard and the platform's own alert
rules read.

A small [service account](/access/service-accounts/) with read-only
permissions is the right principal for this:

```bash
deploys role create --project acme --role metrics-reader \
  --permissions deployment.list,deployment.get,deployment.metrics
```

Bind it to your monitoring service account and use the credentials in your
exporter.

## Reading logs and status programmatically

The dashboard tabs are for humans. An agent, script, or CI job reads the same
signals through the API, MCP, and CLI with actions that return **once** — no
open stream to consume:

- **`deployment.status`** — structured pod health in one call: the
  `count` / `ready` / `succeeded` / `failed` tally plus, for every non-ready
  pod, its raw failure reason (`waitingReason`, `terminatedReason`,
  `restartCount`, `exitCode`, `lastTerminatedReason`). This is how you answer
  "is it healthy, and if not, why" without scraping events.
- **`deployment.logs`** — a **bounded snapshot** of recent container output.
  `tailLines` defaults to 200 and is clamped to `[1, 1000]` per pod; the
  response is additionally capped at a committed **256 KiB** byte budget (oldest
  lines dropped, `cappedByBytes` set) so a verbose multi-pod deployment can't
  blow your context window. Set `previous: true` to read the **last crashed container** —
  the panic or stack trace behind a `CrashLoopBackOff` lives there. This reads
  **live**, ephemeral pod output.
- **`deployment.logsHistory`** — the **durable** sibling of `deployment.logs`.
  It reads back a **30-day history** of captured log output over a `since` /
  `until` window, so it survives the pod garbage-collection and full teardowns
  that leave live logs with nothing to read. Lines come back **oldest-first**
  (forward) by default, or **newest-first** with `reverse: true`; page forward or
  back through a large window with the opaque `cursor` (the result returns a
  `nextCursor` until the window is exhausted), and bound a page with `limit`. As
  with `deployment.logs`, a page is byte-budget capped — `cappedByBytes` flags a
  truncated page. Pass `pod` to narrow to a single replica. History **lags live
  output** by the capture flush interval — it's best-effort, not real-time, so
  the freshest lines may not have landed yet; reach for `deployment.logs` when
  you need the current tail. It's available **only for locations configured with
  a log bucket**; locations without one have no history to read.

```bash
# why is it unhealthy?
deploys deployment status --project acme --location gke.cluster-rcf2 --name web

# the crash post-mortem (previous container) — live and ephemeral — as JSON
deploys deployment logs --project acme --location gke.cluster-rcf2 --name web \
  --previous --tail 200 -o json

# durable 30-day history, oldest-first, over the last 24 hours
deploys deployment logs-history --project acme --location gke.cluster-rcf2 \
  --name web --since 24h

# the same window, newest-first
deploys deployment logs-history --project acme --location gke.cluster-rcf2 \
  --name web --since 24h --reverse
```

`--follow` on the CLI re-polls the `deployment.logs` snapshot for you; the API
and MCP contracts stay snapshot-only (one call, one bounded result).
`deployment.logsHistory` is a windowed read rather than a tail — page it with
`cursor` instead of following it.

{{< callout type="warning" >}}
`deployment.logs` reads **live** pod logs, which are ephemeral — they're gone
once a pod is garbage-collected, and `previous` only survives until then. A
deployment that crashed and was fully torn down leaves nothing for it to read.
For the durable signal, reach for `deployment.logsHistory` (the 30-day captured
history, where the log bucket is configured) or `deployment.status`'s
`lastTerminatedReason` / `exitCode`. `deployment.logs` itself is not a
historical log store.
{{< /callout >}}

### Permissions

The split is deliberate, because raw `stdout` can contain secrets while pod
status cannot:

- **`deployment.status`** is authorized by the ordinary **`deployment.get`**
  permission — the same read used for `deployment.get` and `deployment.metrics`.
- **`deployment.logs`** requires its own dedicated **`deployment.logs`**
  permission, which is **not** public-bindable. Grant config/status reads
  without granting log reads.
- **`deployment.logsHistory`** reuses that **same `deployment.logs`** permission
  — the durable history carries the same secret-bearing `stdout`, so it's gated
  exactly like the live read. Granting `deployment.logs` covers both.

A localhost agent can mint a read-only, short-lived token scoped to exactly
these two permissions with [`me.generateToken`](/automation/mcp/) (it accepts
`deployment.get` and `deployment.logs`), so an observability credential never
carries write access.

## React to failures without polling

`deployment.status` and `deployment.logs` tell you *what's* wrong — but an agent
still has to know *when* to look. Polling a deployment on a timer wastes calls and
adds latency. The
[notification](/automation/notification-channels/) side closes the loop: the
platform emits a [`deployment.health`](/automation/notification-channels/) failure
event the instant a deployment fails asynchronously (a crash-loop the auto-error
reconcile tears down, or a deployer apply failure), so you read failure detail
**only at the moment it happens**.

A localhost agent runs the whole observe→diagnose→fix loop over shipped contracts,
no public URL and no polling:

1. **Mint a scoped token.** [`me.generateToken`](/automation/mcp/) with
   `notification.create` / `notification.pull` / `notification.delete` +
   `deployment.get` + `deployment.logs`.
2. **Subscribe a pull channel.** `notification.create` type `pull`,
   `subscription: { events: ["deployment.health", "deployment.deploy"], outcomes: ["failure"] }`.
   A `pull` channel needs no inbound endpoint — you fetch from it.
3. **Loop `notification.pull`.** On a `deployment.health` failure event:
   - `deployment.status` → confirm the structured per-pod reason,
   - `deployment.logs` (`previous: true` if it's `CrashLoopBackOff`) → the panic / stack trace,
   - decide: `deployment.rollback`, or redeploy with a fix.
4. **Recovery arrives on the same stream.** Your fix's `deployment.deploy`
   **success** event flows through the same channel — that's the "it's healthy
   again" signal, no separate event needed. `notification.delete` on exit (an
   inactivity reaper cleans up if the agent crashes).

```bash
# subscribe once
deploys notification create --project acme --name agent-loop --type pull \
  --event deployment.health --event deployment.deploy --outcome failure

# then long-poll for the next failure (--follow re-polls for you)
deploys notification pull --project acme --name agent-loop --follow
```

The same `deployment.health` event also drives push channels (webhook, Discord)
for humans — see [notification channels](/automation/notification-channels/).
