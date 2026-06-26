---
title: 'The deploys CLI'
linkTitle: 'CLI'
weight: 1
description: 'A small Go binary that wraps the API — handy for shell scripts and CI jobs.'
lead: 'The deploys CLI drives every user-facing API from the terminal — deployments, domains, routes, WAF, the registry, billing, env groups, and more. It''s the same backend the console talks to, just with a less-clicky interface.'
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

1. **`DEPLOYS_TOKEN`** — a Bearer token. Useful for short-lived personal use, and
   for a [Google Cloud service-account](/api/overview/#authentication) access
   token (see below).
2. **`DEPLOYS_AUTH_USER` + `DEPLOYS_AUTH_PASS`** — a [service account](/access/service-accounts/)
   email and key, sent as HTTP Basic. The right choice for CI.
3. **Google default credentials**. If neither of the above is set, the CLI
   falls back to Application Default Credentials — `gcloud auth login` or a
   workload-identity environment.

You can also point the CLI at a non-default API endpoint via
`DEPLOYS_ENDPOINT` (mainly useful for staging).

```bash
export DEPLOYS_AUTH_USER=ci@acme.serviceaccount.deploys.app
export DEPLOYS_AUTH_PASS=…the key…
deploys me get
```

To use a **Google Cloud service account**, put a SA access token in
`DEPLOYS_TOKEN`. The token must carry the `userinfo.email` scope, and the SA's
email must be granted the permissions you need — see
[Google Cloud service-account auth](/api/overview/#authentication).

```bash
export DEPLOYS_TOKEN=$(gcloud auth print-access-token \
  --scopes=https://www.googleapis.com/auth/userinfo.email)
deploys me get
```

## Command shape

```text
deploys <namespace> <action> [--flags] [-oyaml | -ojson | -otable]
```

Output defaults to a table; switch to YAML or JSON with `-oyaml` / `-ojson`
for piping into other tools. Running `deploys` with no arguments prints the
full list of namespaces and their actions.

### Namespaces

| Namespace | Aliases | Actions |
|---|---|---|
| `me` | — | `get`, `authorized` |
| `billing` | — | `create`, `list`, `get`, `update`, `delete`, `report`, `skus`, `project`, `invoices`, `invoice`, `downloadinvoice`, `downloadreceipt` |
| `location` | — | `list`, `get` |
| `project` | — | `create`, `list`, `get`, `update`, `delete`, `usage` |
| `role` | — | `create`, `list`, `get`, `delete`, `grant`, `revoke`, `users`, `bind` |
| `deployment` | `deploy`, `d` | `list`, `get`, `deploy`, `delete`, `revisions`, `pause`, `resume`, `restart`, `rollback`, `metrics`, `errors`, `set image` |
| `site` | — | `publish`, `deploy`, `preview` |
| `domain` | — | `create`, `get`, `list`, `delete`, `purgecache` |
| `route` | — | `create`, `get`, `list`, `delete` |
| `waf` | — | `get`, `list`, `set`, `delete`, `metrics`, `limitmetrics` |
| `disk` | — | `create`, `get`, `list`, `update`, `delete` |
| `pullsecret` | `ps` | `create`, `get`, `list`, `delete` |
| `workloadidentity` | `wi` | `create`, `get`, `list`, `delete` |
| `serviceaccount` | `sa` | `create`, `get`, `list`, `update`, `delete`, `createkey`, `deletekey` |
| `email` | — | `send`, `list` |
| `registry` | — | `list`, `get`, `tags`, `manifests`, `storage`, `delete`, `deletemanifest`, `untag`, `gc`, `metrics` |
| `envgroup` | `eg` | `create`, `get`, `list`, `update`, `delete` |
| `auditlog` | — | `list` |
| `dropbox` | — | `list`, `metrics`, `upload` |
| `github` | — | `link`, `unlink`, `update`, `list` |
| `scheduler` | — | `create`, `get`, `list`, `update`, `delete`, `pause`, `resume`, `trigger`, `logs` |

The internal `Deployer` and `Collector` APIs are machine-to-machine and not
exposed here. The two multipart upload endpoints — KYC documents and invoice
transfer slips — aren't either; use the console for those.

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

# gate a deployment behind Google login (see /deployments/access/)
deploys deployment deploy \
  --project acme --location gke.cluster-rcf2 \
  --name internal-tool --image registry.deploys.app/acme/tool:v3 \
  --type WebService --port 8080 \
  --requireGoogleLogin=true --allowedDomains acme.com

# update just the image (handy in CI after a build)
deploys deployment set image web \
  --project acme --location gke.cluster-rcf2 \
  --image registry.deploys.app/acme/web@sha256:…

# restart a deployment (recreate its pods, same config)
deploys deployment restart \
  --project acme --location gke.cluster-rcf2 --name web

# roll back to a previous revision
deploys deployment rollback \
  --project acme --location gke.cluster-rcf2 \
  --name web --revision 7

# create an env group from inline key=value pairs (repeat --env)
deploys envgroup create --project acme --name shared \
  --env LOG_LEVEL=info --env REGION=apac

# list registry repositories and a repo's tags
deploys registry list --project acme
deploys registry tags --project acme --repository web

# recent audit-log entries for a project
deploys auditlog list --project acme --limit 20

# purge a cached file from a custom domain's edge
deploys domain purgecache --project acme \
  --domain www.acme.com --file /assets/app.js

# upload a file to dropbox and get a short-lived public download URL
deploys dropbox upload --project acme --file site.tar.gz --ttl 7
```

`deployment deploy` carries the full deployment config in flags — beyond the
basics above it covers env groups (`--envGroups`, `--addEnv`, `--removeEnv`),
[access](/deployments/access/) (`--requireGoogleLogin`, `--allowedEmails`,
`--allowedDomains`), resources (`--cpuRequest`, `--memLimit`, …), a
[disk](/storage/disks/) (`--diskName`, `--diskMountPath`), and sidecars
(`--sidecarsFile`). Run `deploys deployment deploy` with no flags to see them all.

## Publishing a static site

The `site` namespace builds a [static site](/deployments/static-sites/) from a
local folder and uploads it as an immutable release — no GitHub Actions
required. An upload progress bar is shown while files upload.

```bash
# build first (npm run build, hugo, …), then publish ./dist and deploy it
# as a permanent deployment — prints the rolling url and the immutable releaseUrl
deploys site deploy --project acme --name website --dir ./dist --location gke.cluster-rcf2
```

- `site publish` uploads the folder and prints a `site://` release ref **without
  deploying** — handy for scripting or feeding a `Static` deployment yourself.
- `site preview` deploys a throwaway, auto-deleting preview (see
  [Static sites → Preview deployments](/deployments/static-sites/#preview-deployments)).

`--spa` and `--notFound` mirror the build-action inputs; `--environment` defaults
to `production`. Publishing needs the `site.publish` permission and active
billing.

{{< callout type="note" >}}
For CI, the [build-deploy-action](/automation/deploy-from-github/)
(`mode: static`) is still the best fit — it builds on a runner and is keyless.
`site deploy` is the quickest path for a one-off or a locally-built site. Either
way the CLI lists, gets, and rolls back a `Static` deployment like any other.
{{< /callout >}}

## Editing the WAF zone

The WAF set call replaces the whole zone — all rules and rate limits — in one
all-or-nothing operation, so the CLI takes a spec file rather than per-rule
flags. The round-trip is: dump the current zone as YAML, edit it, set it back.

```bash
# dump the live zone
deploys waf get --project acme --location gke.cluster-rcf2 -oyaml > waf.yaml

# …edit waf.yaml: add a rule or a rate limit…

# apply it back (-f is required so a bare `waf set` can't wipe the zone)
deploys waf set --project acme --location gke.cluster-rcf2 -f waf.yaml
```

The read-only fields in the dumped YAML (status, timestamps) are ignored on
set, so you can feed the `waf get` output straight back in after editing. See
[Web Application Firewall](/networking/waf/) for the rule and limit schema.

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

- For CI integration, see [GitHub Action](/automation/github-action/) and
  [Deploy from GitHub](/automation/deploy-from-github/).
- The [API reference](/api/overview/) is the comprehensive view of every
  endpoint, including the few the CLI doesn't surface.
```
