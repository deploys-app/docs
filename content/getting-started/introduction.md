---
title: 'Introduction'
linkTitle: 'Introduction'
weight: 1
description: 'What Deploys.app is, who it is for, and how the platform is organized.'
lead: 'Deploys.app is a container platform-as-a-service. You bring a container image; it runs, routes, scales, and bills it — on managed Kubernetes you never have to touch.'
---

## What Deploys.app does

Deploys.app turns a container image into a running, internet-reachable service
without asking you to operate a cluster. You hand it an image and a little
configuration — CPU, memory, port, environment — and the platform takes care of
scheduling, rollout, TLS certificates, routing, autoscaling, logging, metrics,
and usage-based billing.

It is built on Kubernetes, but Kubernetes never leaks into your day. There are no
nodes to patch, no ingress controllers to wire up, no manifests to template. The
unit you work with is the **deployment**, not the pod.

## Who it's for

- **Developers** ship and observe their apps — deploy an image, read logs,
  watch metrics, roll back a bad release.
- **Platform / DevOps engineers** manage the surrounding infrastructure —
  domains, routing, disks, registries, roles, and billing.
- **Project owners** manage membership and project-level settings.
- **Automated systems** deploy on behalf of humans through the REST API or the
  GitHub Action, authenticating as a [service account](/access/service-accounts/).

## How work is organized

Everything you create lives inside a [**project**](/access/projects/) — a
workspace that groups your deployments and the resources they depend on. Within a
project you run [**deployments**](/deployments/overview/), attach
[**domains**](/networking/domains/) and [**routes**](/networking/routes/), mount
[**disks**](/storage/disks/), and store images in a private
[**registry**](/registry/overview/).

Access is governed by [**roles**](/access/roles/) with granular permissions, so
each member — human or machine — sees and changes only what they should. Costs
roll up to a [**billing account**](/billing/overview/) that can span several
projects.

{{< callout type="note" >}}
Every workload runs in a **location** — a geographic Kubernetes cluster such as
`gke.cluster-rcf2`. You pick a location per deployment, and your public hostname
inherits that location's domain suffix.
{{< /callout >}}

## What you can run

| Workload | Use it for |
|---|---|
| **Web service** | Internet-facing HTTP apps and APIs, with autoscaling and a managed hostname. |
| **Worker** | Long-running background processes with no inbound traffic. |
| **Scheduled job** | Cron-style tasks that run on a schedule and exit. |
| **Internal TCP service** | Non-HTTP protocols, reachable from inside your cluster. |

See [Deployment types](/deployments/types/) for the full breakdown.

## Three ways to drive it

You can operate Deploys.app however fits your workflow — the [console](https://console.deploys.app),
the [`deploys` CLI](/automation/cli/), and the [REST API](/api/overview/) all
speak to the same backend and the same set of functions.

{{< callout type="tip" title="Next step" >}}
Ready to see it work? The [Quickstart](/getting-started/quickstart/) deploys a
live web service in under five minutes.
{{< /callout >}}
