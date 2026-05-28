---
title: 'Billing overview'
linkTitle: 'Overview'
weight: 1
description: 'Pay-as-you-go pricing, billing accounts, and how invoicing works.'
lead: 'Deploys.app meters everything you run in real time and bills monthly. Costs roll up from projects to a billing account, which is the entity invoices are issued to.'
---

## How pricing works

Pricing is **pay-as-you-go**. You're charged for what your deployments
actually used during the billing period — there's no upfront commitment and
no per-deployment monthly minimum. The metered quantities are:

| Resource | Metered in | Allocated or actual |
|---|---|---|
| **CPU** | vCPU-hours | Allocated (the `requests.cpu` you set) |
| **Memory** | GiB-hours | Allocated (the `requests.memory` you set) |
| **Disk** | GiB-hours | Allocated (the size you provisioned) |
| **Registry storage** | GiB-hours | Actual stored size |
| **Egress** | GiB transferred out | Actual bytes leaving the cluster |
| **Domain CDN** | Flat per domain | Per active domain with CDN on |

Sizing your `resources.requests` matters — that's the number that hits the
invoice for CPU and memory, whether or not the workload uses every cycle.

## Billing accounts

A **billing account** is the cost center invoices roll up to. One billing
account can own multiple projects (e.g. `acme` and `acme-staging` both bill
to **Acme Billing**); a project belongs to exactly one billing account at any
moment.

Each account carries:

- **Name** — the human label.
- **Tax ID / name / address** — what appears on invoices.
- **Active** — whether new charges can post. Inactive accounts can't have new
  resources created against them.

Manage billing accounts at **Billing → Accounts** in the console, or via the
`billing.create`, `billing.update`, `billing.list` API functions.

## Invoices

At the close of each billing period, the platform issues an **invoice** for
each billing account. Invoices have:

- A **number** like `INV-2026-0009`.
- A **period** (`periodStart`, exclusive `periodEnd`).
- **Line items** — one per resource SKU (CPU, memory, disk, egress, CDN).
- **Subtotal, tax (rate + amount), and total** in the account's currency.
- A **status** — `draft`, `open`, `paid`, or `void`.

Drafts are working-in-progress invoices the platform builds during the
period. Once the period closes, the invoice moves to `open` and stays there
until paid (then `paid`) or voided (`void`). You'll see the badge change on
the **Billing → Invoices** page as it progresses.

```bash
curl https://api.deploys.app/billing.listInvoices \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{ "id": "ba_…" }'

curl https://api.deploys.app/billing.downloadInvoice \
  -d '{ "id": "inv_…" }'        # returns a URL to the PDF
```

## Where to watch your costs

Two places:

- **Project dashboard** — a live "allocated price" per deployment, summed
  across the project. Useful for "did anything just balloon?" checks.
- **[Billing report](/billing/usage-reports/)** — usage over a date range,
  broken down by project and resource. The right tool for monthly review and
  for splitting costs between teams.

{{< callout type="tip" >}}
Pausing a deployment stops CPU and memory metering immediately — pause anything
you're not using during a long quiet period (overnight staging, off-hour batch
jobs) and resume when you need it.
{{< /callout >}}
