---
title: 'Deployments overview'
linkTitle: 'Overview'
weight: 1
description: 'What a deployment is, the lifecycle of a rollout, and the views you use to manage one.'
lead: 'A deployment is a running workload. Each one has a name, an image, a few knobs (resources, port, environment), and a single screen in the console where everything about it lives.'
---

## What you see in the list

The Deployments page lists every workload in the current project — across all
locations — with its type, memory request, replica range, location, and the
timestamp of the last successful rollout.

{{< shot src="/img/deployment-list.png" url="console.deploys.app/deployment?project=acme" alt="Deployment list in the console" caption="Five deployments in the acme project — two web services, two workers, and a cron job — each in the same location." >}}

The leading icon shows status at a glance:

- **Green check** — the latest revision rolled out and pods are healthy.
- **Yellow pause** — the deployment is paused; existing pods stop and traffic returns 503.
- **Spinning arrow** — a rollout is in progress.
- **Red cross** — the rollout failed; the previous revision keeps serving.

## The deployment detail page

Clicking a deployment opens its dashboard. The same screen serves five tabs:

- **Metric** — live CPU, memory, request rate, and egress charts.
- **Details** — the full configuration the deployment was rolled out with.
- **Revision** — the rollout history, with a one-click rollback for each.
- **Logs** — a live stream of container stdout/stderr.
- **Events** — the Kubernetes events behind the scenes (useful when something refuses to start).

{{< shot src="/img/deployment-detail.png" url="console.deploys.app/deployment/detail?project=acme&location=gke.cluster-rcf2&name=web" alt="Deployment detail screen showing URL, image, resources, and replicas" caption="Every fact about a running workload — public URL, image tag, resources, env groups — in one place." >}}

Two actions hang off the top right:

- **Deploy New Revision** — opens the deploy form pre-filled with the current
  configuration. Submit it and the new revision rolls out alongside the old one
  with health-checked traffic shifting.
- **Restart** — re-rolls the current revision so the pods are recreated, without
  changing any configuration. Useful to clear bad in-memory state or pick up an
  external change. Available for services and workers (types that keep standing
  pods) — not for cron jobs or static sites, which have none. Requires the
  `deployment.deploy` permission.
- **Pause** — stops the workload without deleting it. Resume restores it from
  the same revision. Useful for cost control on staging or for emergency stops.

## The rollout lifecycle

A successful deployment passes through three states the console surfaces:

{{< steps >}}
{{< step title="Pending" >}}
The new revision is being scheduled. Pods are pulling the image and starting
up. The previous revision keeps serving traffic.
{{< /step >}}
{{< step title="Healthy" >}}
Readiness checks pass on the new pods. Traffic begins shifting onto the new
revision. The deployment status icon turns green.
{{< /step >}}
{{< step title="Steady-state" >}}
The new revision is the only one serving. Autoscaling continues in the
configured replica range. Metrics flow into the dashboard and usage to billing.
{{< /step >}}
{{< /steps >}}

If readiness never passes, the rollout fails and the previous revision keeps
serving — you don't get a broken deployment because of a bad image.

## Automatic error cleanup

A deployment that *should* keep pods running but has **no ready pod for 15
minutes** is automatically marked **error** and its workload is torn down. This
catches a deployment that applied cleanly but then can't stay up — a
crash-looping image, an image that never pulls, or a readiness probe that never
passes — so a dead deployment doesn't sit consuming a slot indefinitely.

It only ever acts on a deployment that is *supposed* to have a running pod, so it
leaves these alone:

- **Scheduled jobs (CronJob)** — they have no standing pods between runs.
- **Paused** deployments, in-flight rollouts, and freshly-deployed revisions
  (which get a grace period to pull the image and start up).

To recover, fix the image or configuration and deploy again — the deployment is
recreated from its spec. While it's torn down its URL stops serving, so a
redeploy is what brings it back.

{{< callout type="note" >}}
A failed *rollout* is different: if a new revision can't become ready, the
**previous revision keeps serving** and nothing is torn down. Cleanup only fires
when there is no ready pod at all for the full grace window — and it backs off
during a cluster-wide incident, so a bad node pool or a registry outage doesn't
mass-error your deployments.
{{< /callout >}}

## How to drive it

Anything you can do from this page, you can do from the [CLI](/automation/cli/)
or [API](/api/overview/). The console, CLI, and API all hit the same backend.

```bash
# list deployments in a project (a non-sensitive index — no env or secrets)
deploys deployment list --project acme

# get the full config of one deployment (env, mounted files, log URLs, …)
deploys deployment get --project acme --location gke.cluster-rcf2 --name web

# pause a deployment
deploys deployment delete --project acme --location gke.cluster-rcf2 --name old-worker
```

`deployment list` returns only each deployment's name, type, status and other
metadata — never its environment variables or other secrets. Use `deployment
get` for the full configuration. See [Roles & permissions](/access/roles/) for
how this lets you grant list access without exposing secrets.

{{< callout type="note" >}}
For each command above the equivalent API call is `POST https://api.deploys.app/deployment.<verb>` with the same fields as JSON. See the [API overview](/api/overview/).
{{< /callout >}}
