---
title: 'Core concepts'
linkTitle: 'Core concepts'
weight: 3
description: 'The entities you work with — projects, deployments, domains, disks, and the rest — and how they fit together.'
lead: 'Most of Deploys.app boils down to a small set of concepts. Knowing them up front makes the rest of the docs much shorter.'
---

## The shape of the platform

Everything is organized around a **project**. A project owns its **deployments**,
its **domains** and **routes**, its **disks**, its slice of the **registry**, and
its **roles**, **service accounts**, and **workload identities**. Deployments
inside a project run in a **location** — a managed Kubernetes cluster in a
particular region.

Costs flow upward: usage in a project gets billed to its **billing account**,
which can span multiple projects.

## Entities at a glance

| Concept | What it is | Lives in |
|---|---|---|
| **Project** | A workspace that owns all your resources | — |
| **Location** | A managed cluster you can deploy to (e.g. `gke.cluster-rcf2`) | — |
| **Deployment** | A running workload — web service, worker, cron job, or internal TCP service | Project + Location |
| **Revision** | A historical snapshot of a deployment, kept for rollbacks | Deployment |
| **Domain** | A custom hostname attached to your project | Project + Location |
| **Route** | A `(domain, path)` → deployment mapping | Project + Location |
| **Disk** | A persistent volume you can mount into a deployment | Project + Location |
| **Repository** | A namespace inside `registry.deploys.app` storing image tags | Project |
| **Pull secret** | Credentials for pulling images from a private third-party registry | Project + Location |
| **Workload identity** | A binding from a deployment to a Google Cloud service account | Project + Location |
| **Service account** | A non-human identity with API credentials | Project |
| **Role** | A named bundle of permissions you bind to users or service accounts | Project |
| **Audit log entry** | Who did what, when | Project |
| **Billing account** | The cost center invoices roll up to | — |

## How they fit together

A **deployment** is the heart of the model. To put traffic on it from a custom
hostname, you create a **domain**, then a **route** that maps `(domain, path)`
to the deployment. To persist data across restarts, you create a **disk** and
attach it. To pull a private image, you reference a **pull secret**. To talk to
Google Cloud from inside the deployment, you bind a **workload identity**.

Every deploy creates a new **revision**. Revisions are immutable, so
[rollbacks](/deployments/revisions-rollbacks/) are just "start serving an
older revision again."

## Naming and addressing

- A **project** has a short string ID (e.g. `acme`) that appears in every API
  call and CLI flag (`--project acme`).
- A **deployment** is uniquely identified by `(project, location, name)`. Names
  must be DNS-safe — they end up in your public hostname.
- A **location** has a stable ID like `gke.cluster-rcf2` and a domain suffix
  like `rcf2.deploys.app`. Web services get a managed hostname of the form
  `<deployment>.<project>.<suffix>`.

{{< callout type="tip" >}}
Pick the location closest to your users when you deploy — the hostname suffix is
tied to it, and you can't move a deployment between locations after the fact
(you re-deploy it in the new location and update DNS).
{{< /callout >}}

## Identity and access

People sign in with OAuth; machines authenticate as
[service accounts](/access/service-accounts/) with a token or a key pair. Either
way, the platform answers one question on every call: *is this principal
allowed to do this action in this project?* The answer comes from a
[role](/access/roles/) bound to the principal.

Everything chargeable is metered in real time and rolls up to the project's
billing account. The
[billing report](/billing/usage-reports/) gives you the dollar view.
