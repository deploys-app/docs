---
title: 'Custom metrics'
linkTitle: 'Custom metrics'
weight: 9
description: 'Scrape your own Prometheus /metrics endpoint, chart the series, and alert on them.'
lead: 'A metric source tells the platform to scrape a Prometheus text endpoint on one of your deployments once a minute. The series are stored for 30 days, charted in the console, and can be the target of an alert rule. Sources are project-scoped and run on Deploys.app — there is nothing extra to host.'
---

## What you get

- **Own-deployment scrape** — the collector inside the location GETs
  `http://<service>:<port><path>` on your deployment. You pick the deployment,
  port, and path (`/metrics` by default). There is no URL field; the platform
  builds the in-cluster address so nothing outside your project can be scraped.
- **Gauges and counters** — Prometheus gauges, counters, and untyped series are
  stored. Histogram and summary families (including `_bucket`) are dropped.
- **Hard caps** — 4 sources per project, 100 series per source. Hitting the
  series cap marks the source **truncated** instead of silently dropping extras.
- **Charts** — the same line-chart shape as platform metrics, over 1h / 6h /
  12h / 1d / 7d / 30d.
- **Alerts** — a rule can target `kind=custom` with a source + exact series key
  and metric `value` (gauge) or `rate` (counter, per-minute increase). The
  [alert window](/automation/alerts/#when-a-rule-fires) is the same as for
  CPU / memory / requests / egress.

## Create a source

From the console, open **Metric sources** and create a source. Or use the CLI:

```bash
deploys metricsource set \
  --project acme \
  --name web \
  --location gke.cluster-rcf2 \
  --deployment web \
  --port 9090 \
  --path /metrics
```

`set` is an upsert: the first call creates the source, later calls replace the
config. Path defaults to `/metrics`.

### Fields

| Field | Description |
|---|---|
| **Name** | A project-unique name (lowercase, e.g. `web`). |
| **Location** | The location the target deployment runs in. |
| **Deployment** | Your own deployment in that location. External hosts are not allowed. |
| **Port** | 1–65535. Must be reachable on the deployment's in-cluster Service. |
| **Path** | Path only, leading `/`, no host, no `://`. Default `/metrics`. |
| **Disabled** | Keep the config but skip scraping. |

{{< callout type="note" >}}
The scrape target is always in-cluster DNS derived from the deployment — never
a free-form URL. That is what keeps this from becoming an SSRF trampoline.
{{< /callout >}}

## Series identity

Each sample is stored under `name{sortedLabels}`, for example
`queue_depth{queue="email"}`. Labels are sorted by name. A series with no
labels is just `name`.

On each scrape the collector keeps gauges, counters, and untyped values, and
drops histogram/summary families. Counters are stored **raw** (monotonic);
rate is computed at query / alert time as a per-minute increase, with resets
clamped at zero.

If a scrape would add an 101st series, the extra series are not stored and the
source is marked **truncated**. The console shows a banner; nothing is dropped
quietly.

## Charts

Query a source over the same short windows as cache/WAF activity (1h, 6h, 12h,
1d, 7d, 30d):

```bash
deploys metricsource query \
  --project acme \
  --name web \
  --series 'queue_depth{queue="email"}' \
  --timerange 1h
```

Empty `--series` lets the server pick the most recently seen series (capped at
100). Gauges average inside each bucket; counters use `max − min` per bucket
(never negative).

A deployment's Metric tab also grows a **Custom** section when a source targets
that deployment. Scrape errors surface as `lastError` on the source.

## Alert on a custom series

Create an alert rule with `kind=custom` instead of a deployment metric:

```bash
deploys alert create \
  --project acme \
  --name email-queue-depth \
  --kind custom \
  --source web \
  --series 'queue_depth{queue="email"}' \
  --metric value \
  --op ">=" \
  --threshold 1000 \
  --for 5
```

`value` compares the gauge (or untyped) sample. `rate` compares the
per-minute increase of a counter. Delivery is still
[`alert.trigger` / `alert.resolve`](/automation/notification-channels/#metric-alerts-alerttrigger-and-alertresolve)
on your notification channels. Window semantics — 80% present to fire, a data
gap does not resolve a firing rule — are the same as [platform-metric
alerts](/automation/alerts/#when-a-rule-fires).

A series that has not been scraped yet evaluates as `nodata`. You can create
the rule before the first scrape.

## Limits

| Limit | Value |
|---|---|
| Sources per project | 4 |
| Series per source | 100 (further series mark the source truncated) |
| Path length | 256 |
| Scrape timeout | 5 seconds |
| Scrape body | 1 MiB |
| Retention | 30 days |

Custom metrics at these caps are included; there is no per-series SKU in v1.

## Using the API directly

`metricSource.set`, `metricSource.get`, `metricSource.list`,
`metricSource.delete`, `metricSource.series`, and `metricSource.query`. Also
on the [MCP server](/automation/mcp/).

## Permissions

| Action | Permission |
|---|---|
| Create / edit | `metricSource.set` |
| View / list / series / query | `metricSource.get` / `metricSource.list` |
| Delete | `metricSource.delete` |

Nothing in the payload is secret, so `metricSource.get` / `metricSource.list`
are grantable to public principals like most read permissions.
