---
title: 'Disks'
linkTitle: 'Disks'
weight: 1
description: 'Persistent block volumes you can mount into a deployment.'
lead: 'A disk is a managed block volume that survives container restarts and rollouts. Create it once, attach it to a deployment, and the data stays put across every redeploy.'
---

## The Disks page

The Disks tab lists every disk in the project, with its size in GiB and the
location it lives in.

{{< shot src="/img/disk-list.png" url="console.deploys.app/disk?project=acme" alt="Disks: postgres-data 50 GiB, uploads 100 GiB, redis-data 10 GiB" caption="Three disks — each tied to a single location, sized for the workload it backs." >}}

## Create a disk

You'll set three things: a **name** (must be unique within the project +
location), a **size** in GiB, and the **location**. The location matters: a
disk can only be attached to deployments in the same location.

```bash
deploys disk create \
  --project acme --location gke.cluster-rcf2 \
  --name uploads --size 100
```

The size is the *initial* size. You can grow it later — see [Resize a
disk](#resize-a-disk) below — but you can't shrink it.

## Attach a disk to a deployment

Mount a disk by adding `disk` to the deployment's configuration. The disk must
exist and be in the same `(project, location)`, and must not already be
attached to another deployment.

```json
{
  "name": "api",
  "image": "registry.deploys.app/acme/api:v1.8.0",
  "disk": { "name": "uploads", "mountPath": "/data" }
}
```

`mountPath` is the absolute path inside the container. Optional `subPath`
mounts a sub-directory of the disk only — useful if you want one disk to back
multiple deployments, each writing into its own folder.

```json
{
  "disk": { "name": "shared-data", "mountPath": "/data", "subPath": "api" }
}
```

{{< callout type="warning" >}}
Only one deployment can mount a given disk at a time. Attempts to attach an
already-mounted disk fail at deploy time. If you need shared storage across
multiple deployments, you currently need a separate disk per deployment (or
mount the same disk with different `subPath`s, with the understanding that
each deployment writes only to its own subpath).
{{< /callout >}}

## Resize a disk

Disks can grow. The new size must be larger than the current size.

```bash
deploys disk update \
  --project acme --location gke.cluster-rcf2 \
  --name uploads --size 200
```

The platform expands the underlying volume; the deployment that owns it
doesn't need to restart, but the filesystem inside the container may not see
the new space until the container is restarted or runs `resize2fs` (depending
on the filesystem).

## Delete a disk

```bash
deploys disk delete \
  --project acme --location gke.cluster-rcf2 \
  --name old-data
```

Deletion fails if the disk is currently attached. Detach it first by
re-deploying without `disk` (or by deleting the deployment).

## What disks are good for

- **Databases you self-host** — Postgres, MySQL, Redis with persistence on.
- **Uploaded user content** — until you move it to object storage.
- **Local caches you want to survive restarts** — search indexes, image
  thumbnails, etc.

What they're *not* good for: anything you'd reach for shared object storage
for. A disk is bound to one location and one deployment at a time. For
multi-region or multi-deployment access, push data to a bucket and serve it
from there.
