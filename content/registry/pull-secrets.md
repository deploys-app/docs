---
title: 'Pull secrets'
linkTitle: 'Pull secrets'
weight: 2
description: 'Credentials for pulling images from third-party private registries.'
lead: 'A pull secret holds the credentials a deployment uses to pull an image from a private registry the platform can''t see otherwise — Docker Hub private repos, GitHub Container Registry, GCR, ECR, and so on.'
---

## When you need one

Three cases:

- Image in **`registry.deploys.app/<project>/...`** within the *same* project →
  no pull secret needed.
- Image in `registry.deploys.app/<otherProject>/...` → create a pull secret
  with credentials that have read access to that project's registry.
- Image in a **third-party registry** (Docker Hub private, GHCR, GCR, ECR,
  Quay, etc.) → create a pull secret with that registry's credentials.

Public images on Docker Hub, GHCR, etc. don't need a pull secret.

## Create a pull secret

A pull secret is scoped to `(project, location)` — different locations can
have different secrets for the same registry, which is useful when a registry
issues per-region credentials.

```bash
deploys pullsecret create \
  --project acme --location gke.cluster-rcf2 \
  --name ghcr \
  --server ghcr.io \
  --username acme-deploy \
  --password "$GHCR_TOKEN"
```

Server is the registry hostname (not a URL). For Docker Hub use
`docker.io`; for GHCR use `ghcr.io`; for GCR/Artifact Registry use the
regional host like `asia-southeast1-docker.pkg.dev`.

## Use it from a deployment

Reference the secret by name in the deploy config:

```json
{
  "name": "api",
  "image": "ghcr.io/acme/private-api:v1.2.3",
  "pullSecret": "ghcr"
}
```

Or via the API, which exposes the full `pullSecret` field:

```bash
curl https://api.deploys.app/deployment.deploy \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{
    "project": "acme",
    "location": "gke.cluster-rcf2",
    "name": "api",
    "image": "ghcr.io/acme/private-api:v1.2.3",
    "pullSecret": "ghcr"
  }'
```

{{< callout type="note" >}}
The `deploys` CLI's `deployment deploy` doesn't currently expose a
`--pullSecret` flag — set it via the console deploy form or via the API.
{{< /callout >}}

## List, inspect, delete

```bash
deploys pullsecret list --project acme --location gke.cluster-rcf2

deploys pullsecret get \
  --project acme --location gke.cluster-rcf2 --name ghcr

deploys pullsecret delete \
  --project acme --location gke.cluster-rcf2 --name ghcr
```

Deleting a pull secret that's in use by a deployment doesn't break the
*current* revision (the credentials were already baked in), but the next
deploy will fail to pull the image. Rotate or re-create the secret before
deleting an old one.

## Rotating credentials

Pull-secret values are write-only — the API returns metadata but never the
password. To rotate, overwrite with `pullsecret create` (same name, new
password). Existing deployments keep pulling with the new credentials on
their next image pull (i.e. next rollout or pod restart).

## Common registry hosts

| Registry | `server` value |
|---|---|
| Docker Hub | `docker.io` |
| GitHub Container Registry | `ghcr.io` |
| Google Artifact Registry (regional) | `<region>-docker.pkg.dev` |
| Google Container Registry (legacy) | `gcr.io` |
| Amazon ECR | `<account>.dkr.ecr.<region>.amazonaws.com` |
| Quay.io | `quay.io` |

For ECR specifically, you'll typically wire a CI step that runs
`aws ecr get-login-password` and `pullsecret create` together — the token is
short-lived.
