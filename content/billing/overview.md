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
| **Static site storage** | GiB-months | Actual stored size of your published [static site](/deployments/static-sites/) releases |
| **Egress** | GiB transferred out | Actual bytes leaving the container (destination isn't tracked) |
| **External route egress** | GiB transferred out | Actual bytes served from the edge for an [external HTTP route](/networking/routes/#external-server-http) |

Sizing your `resources.requests` matters — that's the number that hits the
invoice for CPU and memory, whether or not the workload uses every cycle.

Where a location provides edge caching, the CDN that fronts your
[custom domains](/networking/domains/) is included at no extra charge — there's
no separate CDN line item.

## Billing accounts

A **billing account** is the cost center invoices roll up to. One billing
account can own multiple projects (e.g. `acme` and `acme-staging` both bill
to **Acme Billing**); a project belongs to exactly one billing account at any
moment.

Each account carries:

- **Name** — the human label.
- **Entity type** — `individual` or `company` (default `individual`). A
  **company** is a juristic person, so its tax invoices and receipts print the
  branch designation **"Head Office (สำนักงานใหญ่)"** beside its address, as Thai
  tax law requires; an individual does not. Set it on the create/edit form or
  via the `type` field on `billing.create` / `billing.update`.
- **Tax ID / name / address** — what appears on invoices.
- **Active** — whether new charges can post. Inactive accounts can't have new
  resources created against them.

Our own company address (the seller) always shows "Head Office (สำนักงานใหญ่)" on
every invoice and receipt.

Manage billing accounts at **Billing → Accounts** in the console, or via the
`billing.create`, `billing.update`, `billing.list` API functions.

An account has one **owner** and can invite others to help manage it — an admin
to co-run the account or an accountant who only pays invoices. See
[Members & roles](/billing/members/) for the roles and how to invite or remove
people.

## Invoices

At the close of each billing period, the platform issues an **invoice** for
each billing account. Invoices have:

- A **number** like `INV-2026-0009`.
- A **period** (`periodStart`, exclusive `periodEnd`).
- **Line items** — one per resource SKU (CPU, memory, disk, egress).
- **Subtotal, tax (rate + amount), and total** in the account's currency.
- A **status** — `draft`, `open`, `paid`, or `void`.

Drafts are working-in-progress invoices the platform builds during the
period. Once the period closes, the invoice moves to `open` and stays there
until paid (then `paid`) or voided (`void`). You'll see the badge change on
the **Billing → Invoices** page as it progresses.

When an invoice is marked **paid**, it is also assigned a separate **receipt
number** (`receiptNumber`) of the form `DPLY-RC-YYYYMM-NNNN`. This is the
receipt / tax-invoice document's own running number — a gapless sequence that
resets each calendar month — and is **distinct from the invoice number**
(`number`). A paid invoice's receipt can be downloaded as its own PDF, which
carries the receipt number as its document number.

```bash
curl https://api.deploys.app/billing.listInvoices \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{ "id": "ba_…" }'

curl https://api.deploys.app/billing.downloadInvoice \
  -d '{ "id": "inv_…" }'        # returns a URL to the invoice PDF

curl https://api.deploys.app/billing.downloadReceipt \
  -d '{ "id": "inv_…" }'        # paid invoices only; returns the receipt PDF
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
