---
title: 'Revisions and rollbacks'
linkTitle: 'Revisions & rollbacks'
weight: 5
description: 'Every deploy creates an immutable revision. Roll back to any of them in one call.'
lead: 'A revision is the exact configuration that was rolled out at some point in time — image, env, replicas, the lot. Revisions are immutable, which makes rollback safe and predictable.'
---

## What gets recorded

Each successful call to `deployment.deploy` increments the deployment's
revision counter and snapshots the full configuration at that revision number.
Revisions are immutable and addressable forever (until the deployment itself is
deleted).

A revision captures the same fields you see on the **Details** tab:

- image (tag *and* resolved digest)
- type, port, protocol, internal
- env, envGroups, command, args
- resources (requests and limits)
- minReplicas, maxReplicas
- disk, pullSecret, workloadIdentity
- schedule (for cron jobs)

## The Revision tab

Open a deployment and switch to **Revision** for a chronological list of every
roll-out, with timestamps, the actor, and a **Rollback** button on each row.

```bash
deploys deployment get \
  --project acme --location gke.cluster-rcf2 \
  --name web --revision 23   # fetch the config of a specific revision
```

## Rolling back

A rollback re-applies an old revision's configuration as a *new* revision. The
revision counter still moves forward — it never moves backward. That keeps the
history honest.

In the console, click **Rollback** on the revision you want, confirm, and the
platform rolls out a new revision with that older configuration. From the API:

```bash
curl https://api.deploys.app/deployment.rollback \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{ "project": "acme", "location": "gke.cluster-rcf2",
        "name": "web", "revision": 22 }'
```

`revision` is the number you want to restore *to*. A new revision is created
with the same configuration; the rollback shows up in the
[audit log](/access/audit-log/) like any other deploy.

{{< callout type="warning" >}}
A rollback re-pulls the image at its **original digest**. Even if you've since
deleted or overwritten the original tag in the registry, rollback works as
long as that digest still exists. If the digest is gone (e.g. you purged the
repository), rollback fails.
{{< /callout >}}

## When you'd reach for a rollback

- A new revision starts failing readiness — readiness blocks traffic shifting,
  so users keep hitting the previous revision, but the new revision is still
  the "latest." Roll back to the previous one to clear the failed deploy.
- A configuration change (env, command, schedule) had an unintended effect.
- A new image surfaces a regression in production that didn't show up in
  staging. Roll back, then fix forward at your own pace.

## Pause vs rollback

Two different operations:

- **Pause** stops the workload (no pods, no traffic) without changing
  configuration. Resume restores it. Use it for emergency stops or to halt
  cost on a deployment you're not ready to delete.
- **Rollback** keeps the workload running but switches it to an earlier
  configuration. Use it to undo a bad deploy.

You can combine them — pause a misbehaving deployment first, then roll it back
once you've decided what to do.
