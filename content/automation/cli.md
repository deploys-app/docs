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

The CLI accepts authentication four ways, in this order of precedence:

1. **`DEPLOYS_AUTH_USER` + `DEPLOYS_AUTH_PASS`** — a [service account](/access/service-accounts/)
   email and key, sent as HTTP Basic. The right choice for CI.
2. **`DEPLOYS_TOKEN`** — a Bearer token (an empty value is treated as unset).
   Useful for short-lived personal use, and for a
   [Google Cloud service-account](/api/overview/#authentication) access token
   (see below).
3. **A stored login** — sign in interactively with `deploys login`, which opens a
   browser to authorize and saves the account under your config dir; later
   commands reuse it automatically. Manage stored accounts with `deploys auth`
   (`status`, `list`, `switch`, `logout`).
4. **Google default credentials**. If none of the above is set, the CLI falls
   back to Application Default Credentials — `gcloud auth login` or a
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

## Logging in

For interactive use, sign in through the browser instead of managing tokens by
hand:

```bash
deploys login
```

This runs an OAuth authorization-code flow (PKCE, over a loopback redirect): it
opens your browser, you approve, and the CLI stores the resulting credential
under your config dir (override the location with `DEPLOYS_CONFIG_DIR`). Later
commands pick it up automatically — it's the **stored login** in the precedence
list above, so it applies only when neither `DEPLOYS_AUTH_USER` /
`DEPLOYS_AUTH_PASS` nor `DEPLOYS_TOKEN` is set. A local login therefore doesn't
interfere with CI, which keeps using the env vars.

`login` and `logout` are top-level aliases for `deploys auth login` /
`deploys auth logout`; the rest of account management lives under `deploys auth`.

### Multiple accounts

Stored credentials are keyed by `(endpoint, email)`, so you can stay logged in as
several accounts at once and switch between them:

```bash
deploys auth list                        # stored accounts, grouped by endpoint
deploys auth switch -account me@acme.com  # set the active account for the endpoint
deploys deployment list -account me@acme.com  # …or pick one per command
```

`DEPLOYS_ACCOUNT` does the same as `-account` for a whole shell session. See
which credential is in effect — and when it expires — with `deploys auth status`.

Sessions are time-limited; the CLI prints a warning as expiry approaches, so run
`deploys login` again to renew. To sign out:

```bash
deploys logout        # the active account for this endpoint
deploys logout -all   # every stored account
```

### Remote and headless hosts

On a remote or SSH host with no local browser, pass `-no-browser` and forward the
printed callback port back to your workstation:

```bash
deploys login -no-browser
```

For a script that needs the raw bearer token of the stored login (e.g. to call
the API with `curl`), print it with `deploys auth token`. In CI, prefer a
[service account](/access/service-accounts/) over an interactive login.

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
| `auth` | — | `login`, `logout`, `status`, `list`, `switch`, `token` |
| `me` | — | `get`, `authorized`, `permissions`, `generate-token`, `list-tokens`, `revoke-token` |
| `billing` | — | `create`, `list`, `get`, `update`, `delete`, `report`, `skus`, `project`, `invoices`, `invoice`, `downloadinvoice`, `downloadreceipt` |
| `location` | — | `list`, `get` |
| `project` | — | `create`, `list`, `get`, `update`, `delete`, `usage` |
| `role` | — | `create`, `list`, `get`, `delete`, `grant`, `revoke`, `users`, `bind`, `permissions` |
| `deployment` | `deploy`, `d` | `list`, `get`, `deploy`, `delete`, `revisions`, `pause`, `resume`, `restart`, `rollback`, `metrics`, `status`, `logs`, `extend-ttl`, `set` |
| `error` | `errors` | `list`, `get`, `update`, `report` |
| `site` | — | `publish`, `deploy`, `preview` |
| `domain` | — | `create`, `get`, `list`, `delete`, `purgecache` |
| `route` | — | `create`, `get`, `list`, `delete` |
| `waf` | — | `get`, `list`, `set`, `delete`, `metrics`, `limitmetrics` |
| `cache` | — | `get`, `list`, `set`, `delete`, `metrics` |
| `disk` | — | `create`, `get`, `list`, `update`, `delete`, `metrics` |
| `pullsecret` | `ps` | `create`, `get`, `list`, `delete` |
| `workloadidentity` | `wi` | `create`, `get`, `list`, `delete` |
| `serviceaccount` | `sa` | `create`, `get`, `list`, `update`, `delete`, `createkey`, `deletekey` |
| `email` | — | `send`, `list` |
| `registry` | — | `list`, `get`, `tags`, `manifests`, `storage`, `delete`, `deletemanifest`, `untag`, `gc`, `metrics` |
| `envgroup` | `eg` | `create`, `get`, `list`, `update`, `delete` |
| `auditlog` | — | `list` |
| `dropbox` | — | `list`, `metrics`, `upload`, `upload-url` |
| `github` | — | `link`, `unlink`, `update`, `list` |
| `scheduler` | — | `create`, `get`, `list`, `update`, `delete`, `pause`, `resume`, `trigger`, `logs` |
| `notification` | — | `create`, `get`, `list`, `update`, `delete`, `test`, `deliveries`, `pull` |

For `billing`, `create` / `update` take a `-type individual|company` flag (a
company prints "Head Office (สำนักงานใหญ่)" on its tax documents).
`downloadinvoice` returns the invoice PDF for any status, while
`downloadreceipt` returns the receipt / tax-invoice PDF only once the invoice is
**paid** (and a receipt number has been assigned).

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
