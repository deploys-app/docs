---
title: 'Notification channels'
linkTitle: 'Notifications'
weight: 6
description: 'Get notified when something changes in your project — deliver create / update / delete / deploy events to a webhook or a Discord channel, filtered by what you care about.'
lead: 'A notification channel delivers a notification whenever a matching change happens in your project — a deploy, a domain edit, a role grant. Point it at a signed webhook or a Discord channel, choose which changes it receives, and review every delivery. Channels are project-scoped and run on Deploys.app.'
---

## What you get

- **Change notifications** — the same writes that produce an [audit log](/access/audit-log/) entry (create, update, delete, deploy, grant, …) fan out to your channels.
- **Webhook or Discord** — a signed JSON webhook your service verifies, or a Discord incoming-webhook URL that posts a one-line message.
- **Subscription filters** — receive only the resource types, actions, and outcomes you care about; leave a filter empty to match everything.
- **Send test** — deliver a synthetic change on demand and see the result.
- **Delivery log** — every delivery records its time, result, HTTP status, and latency.

{{< callout type="note" >}}
Notification delivery is **at-least-once**: a change may arrive more than once
(a retry re-sends the **byte-identical** payload), and events from different
changes can arrive out of order. Make your receiver idempotent — see
[Delivery contract](#delivery-contract).
{{< /callout >}}

## Create a channel

{{< shot src="/img/notification-list.png" url="console.deploys.app/notification?project=acme" alt="The notification channels list" caption="Each channel shows its type, target, and whether it is enabled." >}}

From the console, open **Notifications** and click **Create channel**. Or use the CLI:

```bash
deploys notification create \
  --project acme \
  --name ops-webhook \
  --type webhook \
  --url https://hooks.example.com/deploys \
  --secret "$SIGNING_SECRET" \
  --resource-type deployment \
  --action deploy \
  --action delete
```

### Fields

| Field | Description |
|---|---|
| **Name** | A project-unique name (lowercase, e.g. `ops-webhook`). |
| **Type** | `webhook` (signed JSON POST) or `discord` (a Discord incoming-webhook URL). |
| **URL** | The `https` endpoint to deliver to. |
| **Secret** | The webhook signing secret (webhook only). Write-only — see [Webhook](#webhook). |
| **Subscription** | Which changes the channel receives — see [Subscription filters](#subscription-filters). |
| **Disabled** | A disabled channel keeps its config but receives no deliveries. |

## Channel types

### Webhook

A webhook channel delivers the change as a JSON `POST`, signed so your endpoint
can confirm it really came from Deploys.app. The body is the change payload:

```json
{
  "project": "acme",
  "location": "gke.cluster-rcf2",
  "actor": "alice@example.com",
  "actorType": "User",
  "action": "deploy",
  "resourceType": "deployment",
  "resourceId": "42",
  "resourceName": "web",
  "outcome": "success",
  "message": "revision 5",
  "time": "2026-06-20T09:00:00Z"
}
```

Each request carries an `X-Deploys-Signature` header — `sha256=` followed by the
hex HMAC-SHA256 of the **exact request body bytes**, keyed with your secret.
Verify it before trusting the payload:

```js
import crypto from 'node:crypto'

// rawBody is the exact bytes received (do NOT re-serialize the parsed JSON).
function verify (rawBody, header, secret) {
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(header || '')
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
```

The same scheme works in any language: HMAC-SHA256 the raw body with your
secret, hex-encode it, prefix `sha256=`, and compare in constant time.

{{< callout type="warning" >}}
The signing secret is **write-only**: it is stored to sign each delivery but is
never returned by `notification get` or shown in the console. On **edit**, leave
the secret blank to keep the stored one; set it to replace it.
{{< /callout >}}

### Discord

A discord channel posts a one-line message to a Discord
[incoming-webhook URL](https://support.discord.com/hc/en-us/articles/228383668).
The URL embeds Discord's own token, so no separate signing secret is needed —
treat the URL itself as a credential.

```bash
deploys notification create --project acme --name team-discord \
  --type discord \
  --url https://discord.com/api/webhooks/123/abc \
  --outcome failure
```

## Subscription filters

A subscription has three axes — **resource types**, **actions**, and
**outcomes**. A change is delivered to a channel when it matches on every axis;
an empty axis matches anything. So an empty subscription receives every change,
and `outcomes = [failure]` with the others empty receives only failures.

| Axis | Examples | Empty means |
|---|---|---|
| Resource types | `deployment`, `route`, `domain`, `role`, … | any resource |
| Actions | `create`, `update`, `delete`, `deploy`, `grant`, … | any action |
| Outcomes | `success`, `failure` | either outcome |

```bash
# only failed deploys
deploys notification update --project acme --name ops-webhook \
  --resource-type deployment --action deploy --outcome failure
```

## Test and the delivery log

Use **Send test** (console) or `notification test` to deliver a synthetic change
to a channel right now and see the classified result — handy after editing the
URL or secret.

```bash
deploys notification test       --project acme --name ops-webhook
deploys notification deliveries --project acme --name ops-webhook --limit 50
```

{{< shot src="/img/notification-detail.png" url="console.deploys.app/notification/detail?project=acme&name=ops-webhook" alt="A channel's detail page, test result, and delivery log" caption="The detail page shows the channel, a Send test button, and the recent delivery log." >}}

## TLS verification

For HTTPS webhook targets with self-signed or otherwise untrusted certificates,
enable **Skip TLS verification** (`--insecure-tls`). Deliveries are still blocked
from reaching private, loopback, link-local, and cloud-metadata addresses.

## Delivery contract

- **At-least-once.** A failed delivery is retried with exponential backoff (up to
  five attempts). A retry re-sends the **byte-identical** payload — same fields,
  same `time`, same signature — so dedupe on the payload (hash the body, or use
  `resourceType` + `resourceId` + `action` + `time` as a key).
- **Unordered.** Deliveries fan out concurrently, so events for the same resource
  can arrive out of order. Key on `time`, not arrival order.
- **Redacted by construction.** A delivery carries only the audit-safe change
  fields above — never secrets, environment variables, or request bodies.

## Permissions

| Action | Permission |
|---|---|
| Create | `notification.create` |
| Edit | `notification.update` |
| View / list / deliveries | `notification.get` / `notification.list` |
| Delete | `notification.delete` |
| Send test | `notification.test` |

Grant these on a [role](/access/roles/) like any other permission. Channel URLs
can point at internal endpoints, so `notification.get` / `notification.list` are
**not** grantable to public principals (`allUsers` / `allAuthenticatedUsers`).
