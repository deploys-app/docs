---
title: 'Monitoring & debugging'
linkTitle: 'Monitoring & debugging'
weight: 8
description: 'Metrics, logs, and Kubernetes events for diagnosing live deployments.'
lead: 'Every deployment has a dashboard with the three signals you reach for when something is off — usage charts, log output, and the underlying cluster events.'
---

## Metrics

The Metric tab plots CPU, memory, request rate, and egress for the deployment.
Both **usage** and **allocated** (request) lines are shown — the gap between
them tells you whether you're under- or over-provisioned. The time-range
selector spans **1 hour aggregate**, **1 day**, **7 days**, and **30 days**.

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
| Request rate / egress | The ingress and routing layer |
| Logs | Container `stdout` / `stderr`, streamed via the events channel |
| Events | Native Kubernetes events for the deployment's pods |

## Alerting

The platform doesn't ship its own alerting. The recommended pattern is to
poll `deployment.metrics` from your own monitoring system (Grafana,
Datadog, Honeycomb, …) and define alerts there — usage data is the same
underlying time-series the dashboard reads.

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
two signals through the API, MCP, and CLI with two actions that return **once**
— no open stream to consume:

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
  the panic or stack trace behind a `CrashLoopBackOff` lives there.

```bash
# why is it unhealthy?
deploys deployment status --project acme --location gke.cluster-rcf2 --name web

# the crash post-mortem (previous container), as JSON
deploys deployment logs --project acme --location gke.cluster-rcf2 --name web \
  --previous --tail 200 -o json
```

`--follow` on the CLI re-polls the snapshot for you; the API and MCP contracts
stay snapshot-only (one call, one bounded result).

{{< callout type="warning" >}}
These read **live** pod logs, which are ephemeral — they're gone once a pod is
garbage-collected, and `previous` only survives until then. A deployment that
crashed and was fully torn down leaves nothing to read; lean on
`deployment.status`'s `lastTerminatedReason` / `exitCode` for the durable
signal. This is not a historical log store.
{{< /callout >}}

### Permissions

The split is deliberate, because raw `stdout` can contain secrets while pod
status cannot:

- **`deployment.status`** is authorized by the ordinary **`deployment.get`**
  permission — the same read used for `deployment.get` and `deployment.metrics`.
- **`deployment.logs`** requires its own dedicated **`deployment.logs`**
  permission, which is **not** public-bindable. Grant config/status reads
  without granting log reads.

A localhost agent can mint a read-only, short-lived token scoped to exactly
these two permissions with [`me.generateToken`](/automation/mcp/) (it accepts
`deployment.get` and `deployment.logs`), so an observability credential never
carries write access.
