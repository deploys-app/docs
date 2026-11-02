---
title: 'Projects'
linkTitle: 'Projects'
weight: 1
description: 'A workspace that owns deployments, domains, disks, registry, and access.'
lead: 'Projects are the top-level container for everything you build on Deploys.app. Every resource — deployment, domain, disk, role, service account — belongs to exactly one project.'
---

## The Projects page

The Projects page lists every project you have access to. Each card shows the
project name, ID, and a shortcut into it. The "+ New project" tile starts a
fresh project.

{{< shot src="/img/project-list.png" url="console.deploys.app/project" alt="Project list with Acme Corp and Staging" caption="Two projects in this account — pick one to scope everything you do next." >}}

The sidebar's **Current Project** dropdown switches between projects in any
project-scoped page. The selection is remembered in a cookie so the next
session lands on the same project.

## Create a project

A project needs:

- **ID** — a short string, lowercase letters/digits/hyphens. It can't be changed
  later and it appears in every API call.
- **Name** — a human label shown in the console.
- **Billing account** — the cost center invoices roll up to. You can create a
  project in an empty billing account and add billing later, or attach an
  existing one at creation.

```bash
deploys project create \
  --id acme --name "Acme Corp" --billingaccount 1024
```

After creation, the project is empty. Add a [role](/access/roles/), invite
teammates, create a [billing account](/billing/overview/) if you didn't pick
one, and you're ready to deploy.

## Project-level settings

A couple of things live on the project itself, outside any specific resource:

- **Quotas** — caps on what the project can use (max deployments, max replicas
  per deployment). Set on the project record; visible from `project.get`.
- **Config** — reserved for project-level feature toggles. There are none
  today, so `config` comes back empty from `project.get`.

```bash
deploys project get --project acme
```

## Listing usage

```bash
deploys project usage --project acme
```

Returns the project's current monthly usage rolled up by resource type. The
same data drives the project dashboard and feeds the
[billing report](/billing/usage-reports/).

For charts rather than a single rollup, these API functions return time-series:

- **`project.metrics`** — CPU, memory, disk, egress, replica, and static-storage
  usage over time (`timeRange` `7d`, `30d`, or `90d`), the series behind the
  project dashboard.
- **`project.metricsByDeployment`** — daily CPU, memory, pod egress, requests,
  and static storage, one series per current deployment. It reads the
  per-deployment samples already collected for deployment charts, so `timeRange`
  is `7d` or `30d` (that history is kept for 30 days). Disk, replicas, cache
  egress, and WAF egress stay on `project.metrics`; they are not recorded per
  deployment.
- **`project.storageMetrics`** — static-site storage held over time (`timeRange`
  `7d`, `30d`, or `90d`).

```bash
curl https://api.deploys.app/project.metrics \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{ "project": "acme", "timeRange": "30d" }'
```

These need only `project.get`.

## Deleting a project

A project can be deleted only when it's empty — every deployment, domain,
disk, registry repository, and service account inside it must already be gone.
This is intentional: deleting a project should never silently nuke data.

```bash
deploys project delete --project acme
```

The audit log retains a record of the project and its activity even after
deletion.

## Patterns

**One project per environment.** A common split is `acme` (production) and
`acme-staging` (staging). They live under the same billing account but their
resources, secrets, and roles are isolated.

**One project per product.** Multi-product teams often run `web`, `data`, and
`platform` as separate projects, each with its own roles and on-call rotation.
Cross-project access uses [service accounts](/access/service-accounts/) bound
in both projects.
