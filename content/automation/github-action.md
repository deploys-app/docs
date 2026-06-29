---
title: 'GitHub Action'
linkTitle: 'GitHub Action'
weight: 4
description: 'Deploy from a GitHub Actions workflow in a single step.'
lead: 'The official deploys-app/deploys-action lets a GitHub Actions workflow roll out a new revision once your image is built and pushed. It''s the deploys CLI wrapped in a step.'
---

{{< callout type="tip" >}}
Want Deploys.app to build the image too — keyless, with preview deployments
on every PR? See [Deploy from GitHub](/automation/deploy-from-github/). This
page covers the deploy-only action for teams that build and push images
elsewhere.
{{< /callout >}}

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

The action calls `deployment.deploy` with these fields. Fields you don't pass
are preserved from the deployment's current revision when possible — so a CI
deploy can pass just `image` and leave the rest as configured.

**Target and artifact:**

| Input | Required | Description |
|---|---|---|
| `project` | yes | Project ID |
| `location` | yes | Location ID (e.g. `gke.cluster-rcf2`) |
| `name` | yes | Deployment name |
| `image` | for containers | Container image with tag or digest |
| `type` | no | [Deployment type](/deployments/types/) — `WebService`, `Worker`, `CronJob`, `InternalTCPService`, `Static` |
| `site` | for `Static` | Static release reference (`site://…@<sha>`); leave `image` empty |
| `siteManifestDigest` | no | Manifest digest for the static release |

**Networking and scaling:**

| Input | Description |
|---|---|
| `port` | Port the container listens on (`WebService`/`InternalTCPService`) |
| `protocol` | WebService protocol — `http`, `https`, or `h2c` |
| `internal` | Run a WebService as internal-only (`true`/`false`) |
| `minReplicas` / `maxReplicas` | Autoscale bounds (0–20) |
| `schedule` | Cron schedule for a `CronJob` (5 fields) |
| `ttl` | Auto-delete TTL (`7d`, `12h`, seconds…); `0` clears it |

**Environment and container:**

| Input | Description |
|---|---|
| `env` | Env vars (`KEY=VALUE` per line) — replaces the whole set |
| `addEnv` / `removeEnv` | Add / remove individual env vars without replacing the set |
| `envGroups` | [Env groups](/deployments/environment-variables/) to attach (replaces) |
| `addEnvGroups` / `removeEnvGroups` | Add / remove individual env groups |
| `command` / `args` | Override the image entrypoint / arguments (one token per line) |
| `workloadIdentity` | [Workload identity](/access/workload-identity/) to bind |
| `pullSecret` | [Pull secret](/registry/pull-secrets/) for a private registry |

**Storage and resources:**

| Input | Description |
|---|---|
| `diskName` / `diskMountPath` / `diskSubPath` | Attach a [persistent disk](/storage/disks/) |
| `mountData` | Files to mount, as a JSON map of `path → contents` |
| `cpuRequest` / `memoryRequest` / `cpuLimit` / `memoryLimit` | Resource requests and limits |

**[Access control](/deployments/access/):**

| Input | Description |
|---|---|
| `accessRequireGoogleLogin` | Gate the deployment behind Google sign-in (`true`/`false`) |
| `accessAllowedEmails` | Allowed emails, one per line or comma-separated |
| `accessAllowedDomains` | Allowed email domains, one per line or comma-separated |

**Auth and escape hatch:**

| Input | Description |
|---|---|
| `token` / `authUser` / `authPass` | Credentials (default to the `DEPLOYS_*` env vars below) |
| `apiEndpoint` | Override the API endpoint |
| `extraArgs` | A JSON object merged into the `deployment.deploy` request — use for anything not yet a dedicated input |

A Cloud SQL Proxy sidecar can be attached with `cloudSqlProxyInstance`,
`cloudSqlProxyPort`, and `cloudSqlProxyCredentials`.

Outputs: `url` (the deployed URL) and `deployment` (the deployment name).

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
