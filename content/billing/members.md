---
title: 'Members & roles'
linkTitle: 'Members & roles'
weight: 3
description: 'Invite others to help manage a billing account, with owner, admin, and accountant roles.'
lead: 'A billing account starts with a single owner. Invite teammates as members — an admin to help run the account, or an accountant who only needs to see and pay invoices — without handing over the whole account.'
---

## Why members

Billing access isn't a project role. Billing calls are authorized by the
**billing account** itself: the account has one **owner** and, optionally, any
number of **members**. This keeps money separate from projects — someone can
manage invoices without touching a single deployment, and a project `admin`
gets no billing power unless they're also a member of the billing account.

Add members when the person who pays isn't the person who deployed: a finance
teammate who settles invoices, or a second engineer you trust to keep the tax
details and payment current.

## The three roles

- **Owner** — the one account holder, set when the account is created. Full
  control: everything an admin can do, **plus** deleting the account. There's
  exactly one owner and it isn't a member row — it's the `owner` on the account.
- **Admin** — a trusted co-manager. Views and pays invoices, edits the tax
  details, and adds or removes other members. An admin **cannot delete the
  account** — that stays with the owner alone.
- **Accountant** — finance-only. Views invoices and receipts, reads the
  [usage report](/billing/usage-reports/), and pays (uploads a transfer slip).
  An accountant **cannot** change tax details or manage members.

### Capability matrix

| Capability | Owner | Admin | Accountant |
|---|:---:|:---:|:---:|
| View invoices & receipts | ✓ | ✓ | ✓ |
| View usage report | ✓ | ✓ | ✓ |
| Pay (upload transfer slip) | ✓ | ✓ | ✓ |
| Edit tax details | ✓ | ✓ | |
| Manage members (add / remove) | ✓ | ✓ | |
| Delete the billing account | ✓ | | |

The role a member holds is returned as `role` on the billing account (from
`billing.get`), reflecting the **caller's** effective role — `owner`, `admin`,
or `accountant`.

## Listing members

Owners and admins can see who's on the account. The response carries the
account `owner` and one entry per member:

```bash
curl https://api.deploys.app/billing.listMembers \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{ "id": "1024" }'
```

```json
{
  "owner": "owner@acme.dev",
  "items": [
    { "email": "finance@acme.dev", "role": "accountant",
      "createdAt": "2026-06-30T09:00:00Z", "createdBy": "owner@acme.dev" },
    { "email": "ops@acme.dev", "role": "admin",
      "createdAt": "2026-06-30T09:02:00Z", "createdBy": "owner@acme.dev" }
  ]
}
```

Each member records the `createdBy` email — who added them — for audit.

## Inviting a member

An owner or admin invites someone by email and role. The role must be
`admin` or `accountant`:

```bash
curl https://api.deploys.app/billing.addMember \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{
    "id": "1024",
    "email": "finance@acme.dev",
    "role": "accountant"
  }'
```

The call is an **upsert**: adding an email that's already a member updates its
role, so **changing someone's role is just re-inviting them** with the new
role. Adding the account owner's own email is rejected — the owner is never a
member.

{{< callout type="note" >}}
Billing has no public principals. Unlike a project role, which can be bound to
`allUsers` or `allAuthenticatedUsers` for a [public deployment](/access/roles/),
a billing member is always a **real person's email**. There's no way to make an
account's billing "public".
{{< /callout >}}

## Removing a member

```bash
curl https://api.deploys.app/billing.removeMember \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{
    "id": "1024",
    "email": "finance@acme.dev"
  }'
```

Removing takes effect immediately — the next billing call from that person is
denied. You can't remove the owner this way; ownership isn't a membership.

## Deleting the account

Only the **owner** can delete a billing account, and only after every project
attached to it has been moved or removed. Admins and accountants can run the
account day to day but can never delete it — a deliberate guard so a shared
account can't be wiped by a co-manager.

## Patterns

- **Finance settles, engineering builds.** Add your finance teammate as an
  **accountant**. They see invoices and pay them, and never see or touch a
  deployment.
- **A second pair of hands.** Add a trusted engineer as an **admin** so tax
  details and payment don't stall when the owner is away — while keeping delete
  with the owner.
- **Off-board cleanly.** When someone leaves, `billing.removeMember` cuts their
  billing access in one call; the `createdBy` field on the remaining members
  tells you who added whom.
