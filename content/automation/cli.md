---
title: 'The deploys CLI'
linkTitle: 'CLI'
weight: 1
description: 'A small Go binary that wraps the API — handy for shell scripts and CI jobs.'
lead: 'The deploys CLI lets you drive every deployment, role, disk, and pull secret operation from the terminal. It''s the same backend the console talks to, just with a less-clicky interface.'
---

## Install

The CLI is a single Go binary distributed under
[github.com/deploys-app/deploys](https://github.com/deploys-app/deploys).

```bash
# build from source
go install github.com/deploys-app/deploys@latest

# or grab a release binary, drop it on PATH
chmod +x ./deploys && sudo mv ./deploys /usr/local/bin/
```

## Authenticate

The CLI accepts authentication three ways, in this order of precedence:

1. **`DEPLOYS_TOKEN`** — a Bearer token. Useful for short-lived personal use.
2. **`DEPLOYS_AUTH_USER` + `DEPLOYS_AUTH_PASS`** — a [service account](/access/service-accounts/)
   email and key, sent as HTTP Basic. The right choice for CI.
3. **Google default credentials**. If neither of the above is set, the CLI
   falls back to Application Default Credentials — `gcloud auth login` or a
   workload-identity environment.

You can also point the CLI at a non-default API endpoint via
`DEPLOYS_ENDPOINT` (mainly useful for staging).

```bash
export DEPLOYS_AUTH_USER=ci@acme.deploys.app
export DEPLOYS_AUTH_PASS=…the key…
deploys me get
```

## Command shape

```text
deploys <namespace> <action> [--flags] [-oyaml | -ojson | -otable]
```

Output defaults to a table; switch to YAML or JSON with `-oyaml` / `-ojson`
for piping into other tools.

### Namespaces

| Namespace | Aliases | What it covers |
|---|---|---|
| `me` | — | Profile and permission checks |
| `location` | — | List clusters you can deploy to |
| `project` | — | Projects + per-project usage |
| `role` | — | Create roles, bind users/service accounts |
| `deployment` | `deploy`, `d` | Deploy, list, get, delete |
| `route` | — | HTTP routes |
| `disk` | — | Persistent disks |
| `pullsecret` | `ps` | Third-party registry credentials |
| `workloadidentity` | `wi` | GCP federation bindings |
| `serviceaccount` | `sa` | Machine identities + keys |
| `collector` | — | Cluster-side collector commands |

Namespaces not covered by the CLI (today): `domain`, `route` config v2,
`waf`, `registry`, `billing`, `envGroup`, `auditLog`. Use the API or the
console for those.

## Useful one-liners

```bash
# am I authenticated, and as whom?
deploys me get

# locations available to me
deploys location list

# everything in a project, as JSON for jq
deploys deployment list --project acme -ojson | jq '.items[].name'

# deploy a new image into an existing deployment
deploys deployment deploy \
  --project acme --location gke.cluster-rcf2 \
  --name web --image registry.deploys.app/acme/web:v2.4.2 \
  --type WebService --port 8080 \
  --minReplicas 2 --maxReplicas 6

# update just the image (handy in CI after a build)
deploys deployment set image web \
  --project acme --location gke.cluster-rcf2 \
  --image registry.deploys.app/acme/web@sha256:…
```

## Permission check before acting

The `me authorized` call lets a script ask the platform whether the current
principal has a given permission before attempting an operation:

```bash
deploys me authorized \
  --project acme \
  --permissions deployment.deploy,deployment.rollback
```

The response is a list of `{permission, allowed}` pairs. CI pipelines use this
to fail early with a clear error rather than from an opaque 403 mid-deploy.

## Where to go next

- For CI integration, see [GitHub Action](/automation/github-action/) — it
  wraps the CLI for you.
- For everything the CLI doesn't cover, the [API reference](/api/overview/) is
  the comprehensive view.
