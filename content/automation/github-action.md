---
title: 'GitHub Action'
linkTitle: 'GitHub Action'
weight: 2
description: 'Deploy from a GitHub Actions workflow in a single step.'
lead: 'The official deploys-app/deploys-action lets a GitHub Actions workflow roll out a new revision once your image is built and pushed. It''s the deploys CLI wrapped in a step.'
---

## A complete workflow

The shape most teams use: build the image, push it to a registry, deploy by
digest.

{{< code file=".github/workflows/deploy.yml" lang="yaml" >}}
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.repository_owner }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        id: docker_build
        uses: docker/build-push-action@v5
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}:latest

      - name: Deploy
        uses: deploys-app/deploys-action@v1
        with:
          project: acme
          location: gke.cluster-rcf2
          name: web
          image: ghcr.io/${{ github.repository }}@${{ steps.docker_build.outputs.digest }}
          port: 8080
          type: WebService
          minReplicas: 2
          maxReplicas: 6
        env:
          DEPLOYS_AUTH_USER: ${{ secrets.DEPLOYS_AUTH_USER }}
          DEPLOYS_AUTH_PASS: ${{ secrets.DEPLOYS_AUTH_PASS }}
{{< /code >}}

Deploying by digest (`@sha256:…`) instead of by tag makes the rollout
reproducible — the same SHA always means the same bits.

## Inputs

| Input | Required | Description |
|---|---|---|
| `project` | yes | Project ID |
| `location` | yes | Location ID (e.g. `gke.cluster-rcf2`) |
| `name` | yes | Deployment name |
| `image` | yes | Container image with tag or digest |
| `port` | no | Port the container listens on |
| `type` | no | Deployment type (default `WebService`) |
| `minReplicas` | no | Autoscale minimum |
| `maxReplicas` | no | Autoscale maximum |

The action calls `deployment.deploy` with these fields. Fields you don't pass
are preserved from the deployment's current revision when possible.

## Authentication

Two equivalent ways to authenticate; pick one:

- **Service account (recommended for CI)** — `DEPLOYS_AUTH_USER` + `DEPLOYS_AUTH_PASS`.
- **Bearer token** — `DEPLOYS_TOKEN`. Useful for short-lived scripts; rotate
  often.

Generate the service-account key from
[Service accounts → Create key](/access/service-accounts/), then add both
values to the repo's secrets (Settings → Secrets and variables → Actions).

## A minimal example

If you already have an image somewhere and just want a deploy step:

```yaml
- uses: deploys-app/deploys-action@v1
  with:
    project: acme
    location: gke.cluster-rcf2
    name: web
    image: registry.deploys.app/acme/web:v2.4.1
  env:
    DEPLOYS_AUTH_USER: ${{ secrets.DEPLOYS_AUTH_USER }}
    DEPLOYS_AUTH_PASS: ${{ secrets.DEPLOYS_AUTH_PASS }}
```

The action will run `deployment.deploy` and return success only once the API
accepts the call — the actual rollout continues in the background. To gate
the workflow on the new revision being healthy, follow up with a small
script that polls `deployment.get` until the revision and status look right.

## Permissions the CI service account needs

For deploy-only CI, the minimum useful role is:

```bash
deploys role create \
  --project acme --role deployer --name "Deployer" \
  --permissions "project.get,deployment.list,deployment.get,deployment.deploy,registry.list"
```

Then grant it to the CI service account:

```bash
deploys role grant --project acme --role deployer \
  --email ci@acme.deploys.app
```

`registry.list` is only needed if you also push images to
`registry.deploys.app` from the same step.

## Troubleshooting

- **`403 forbidden`** — the service account is missing `deployment.deploy`.
  Run `deploys me authorized --project acme --permissions deployment.deploy`
  in a quick debug step to confirm.
- **Stuck at "Pending"** — the API accepted the call but the new revision
  isn't rolling out. Open the deployment, switch to **Events**, and look for
  `ImagePullBackOff` (wrong image / missing pull secret) or readiness check
  failures.
- **Image not found** — the platform pulled the previous tag and the current
  pull metadata is stale. Deploy by digest (`@sha256:…`) to dodge it
  entirely.
