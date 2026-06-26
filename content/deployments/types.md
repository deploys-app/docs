---
title: 'Deployment types'
linkTitle: 'Types'
weight: 2
description: 'Web services, static sites, workers, scheduled jobs, and TCP services — and when to use each.'
lead: 'Deploys.app runs six kinds of workloads. The type you pick decides whether the platform gives you a public URL, opens a TCP port, runs you on a cron schedule, serves prebuilt files from the edge, or just keeps you running quietly in the background.'
---

## At a glance

| Type | API string | Inbound | Scheduling | Use it for |
|---|---|---|---|---|
| **Web service** | `WebService` | HTTPS on a managed hostname | Autoscales between replica bounds | Internet-facing apps and APIs |
| **Static site** | `Static` | HTTPS on a managed hostname | None — served from object storage | Prebuilt static sites (SPAs, docs, marketing) |
| **Worker** | `Worker` | None | Autoscales between replica bounds | Background processors, queue consumers |
| **Cron job** | `CronJob` | None | Cron schedule, exits when done | Periodic tasks (cleanup, sync, snapshot) |
| **TCP service** | `TCPService` | Raw TCP on an external port | Autoscales between replica bounds | Non-HTTP protocols you need exposed |
| **Internal TCP service** | `InternalTCPService` | TCP inside the cluster only | Autoscales between replica bounds | Databases, caches, and other in-cluster traffic |

## Web service

The default. The platform terminates TLS, gives you a managed hostname
(`<name>.<project>.<location-suffix>`), and routes traffic to your container's
[`port`](/deployments/configuration/) on the `protocol` you pick (`http`,
`https`, or `h2c`).

Set `internal: true` to keep a Web Service inside the cluster — same HTTP
routing, no public hostname.

```bash
deploys deployment deploy \
  --project acme --location gke.cluster-rcf2 \
  --name web --image nginx:1.27 \
  --type WebService --port 80 \
  --minReplicas 1 --maxReplicas 5
```

## Static site

No container — a folder of prebuilt files (HTML, CSS, JS) served straight from
object storage through the platform's edge. You get the same managed HTTPS
hostname as a web service, but there's nothing running between requests, so
there's no `port`, `image`, replicas, or resources to set. Each deploy
publishes an immutable, content-addressed release and flips the live pointer
atomically.

Static releases are built and published by the
[`build-deploy-action`](/automation/deploy-from-github/) with `mode: static`, or
straight from your machine with `deploys site deploy`. See
**[Static sites](/deployments/static-sites/)** for the full walkthrough.

## Worker

No inbound traffic, no port. The container runs continuously and is restarted
if it exits. Use it for queue consumers, background processors, or anything
that pulls work from somewhere else.

```bash
deploys deployment deploy \
  --project acme --location gke.cluster-rcf2 \
  --name worker --image registry.deploys.app/acme/worker:v1.8.0 \
  --type Worker --minReplicas 1 --maxReplicas 2
```

## Cron job

Runs on a schedule, exits, waits for the next firing. The schedule is a
standard 5-field cron expression in UTC.

```bash
deploys deployment deploy \
  --project acme --location gke.cluster-rcf2 \
  --name nightly-cleanup --image acme/cleanup:v1 \
  --type CronJob
# then set the schedule with the deployment.deploy API or the deploy form
```

In the deploy form, the **Schedule** field is enabled when `Type = CronJob`.
The form accepts the same cron expression — e.g. `0 3 * * *` for "every day at
03:00 UTC."

{{< callout type="tip" >}}
Need a job that runs once and exits — not on a schedule? Use a Worker with a
[`ttl`](/deployments/configuration/#ttl-and-one-shot-jobs) so the platform
auto-deletes it after the duration you set.
{{< /callout >}}

## TCP service

Use for protocols that aren't HTTP — game servers, custom binary protocols.
You pick the port; the platform exposes it on an external load balancer.
[Routes](/networking/routes/) don't apply (those are HTTP-only); clients
connect directly to the service's address.

## Internal TCP service

Same as TCP service, but reachable only from inside your project's cluster
(other deployments in the same location). Useful for self-hosting datastores
that should never be exposed publicly.

```bash
deploys deployment deploy \
  --project acme --location gke.cluster-rcf2 \
  --name postgres --image postgres:16 \
  --type InternalTCPService --port 5432
```

Inside other deployments in the same location, reach it at
`postgres.acme.svc.cluster.local:5432`.
