---
title: 'Static sites'
linkTitle: 'Static sites'
weight: 3
description: 'Deploy a prebuilt static site — served straight from object storage at the edge, no container to run.'
lead: 'A Static deployment serves a folder of prebuilt files — HTML, CSS, JS, images — straight from object storage through the platform''s edge, with no container running behind it. You build the site on GitHub''s runners and publish the result; Deploys.app gives it a managed HTTPS hostname and caches it globally.'
---

## How it differs from a container

Every other [deployment type](/deployments/types/) runs your code in a
container. A **Static** deployment doesn't run anything — there's no image, no
port, no replicas. Each deploy publishes an **immutable, content-addressed
release** (a manifest plus per-file blobs) to object storage, and the
platform's static gateway serves it directly. That makes a few things true:

- **It's cheap and fast.** Assets are cached at the edge; there's no container
  burning CPU between requests.
- **Releases are atomic.** A deploy flips the live release pointer in one step —
  no half-updated state — and rolling back is just pointing at an older release.
- **Most deployment settings don't apply.** No `port`, `image`, `protocol`,
  replicas, resources, or environment variables — there's no process to
  configure. The only things you set on a static deployment are
  [access control](/deployments/access/) and an optional
  [auto-delete TTL](/deployments/configuration/#ttl-and-one-shot-jobs).

Static sites still get a managed hostname, work with custom
[domains](/networking/domains/) and [routes](/networking/routes/), and get
per-PR [preview deployments](#preview-deployments) — the same as a web service.

## How to deploy a static site

There are two ways to ship a static release: from **GitHub Actions** (best for
CI — it builds your repo on a runner and is keyless) or straight from **your
machine** with the [CLI](/automation/cli/). Both upload the same kind of
immutable release; pick whichever fits your workflow.

### From GitHub Actions

Static releases are built and published by the
[`build-deploy-action`](/automation/deploy-from-github/) with `mode: static`.
It runs your site's build on GitHub's runners, uploads the output as a release,
and deploys it — keyless, over GitHub OIDC.

The one-time setup (create a service account, install the GitHub App, link the
repository) is identical to a container deploy — follow
[Deploy from GitHub → One-time setup](/automation/deploy-from-github/#one-time-setup),
then add a workflow with `mode: static`:

{{< code file=".github/workflows/deploy.yml" lang="yaml" >}}
name: Deploy
on:
  push:
    branches: [main]
  pull_request:

permissions:
  id-token: write   # required — this is the credential
  contents: read
  pull-requests: write   # lets the action post the preview comment

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: deploys-app/build-deploy-action@v1
      with:
        project: acme
        location: gke.cluster-rcf2
        name: website
        mode: static
        framework: hugo
{{< /code >}}

Push to `main` and the action builds the site, publishes the release, and
deploys it as `website`. The console's **GitHub** page can generate this file
for you, pre-filled — see [Deploy from GitHub](/automation/deploy-from-github/).

### From your machine

Build the site locally, then publish and deploy the output folder in one command
with the [`deploys` CLI](/automation/cli/) — no GitHub Actions required:

{{< code file="deploy.sh" lang="bash" >}}
# build first (npm run build, hugo, …), then publish ./dist and deploy it
deploys site deploy --project acme --name website --dir ./dist --location gke.cluster-rcf2
{{< /code >}}

`site deploy` uploads `--dir` as an immutable release and deploys it as a
permanent `website`, printing the rolling `url` and the immutable `releaseUrl`.
An upload progress bar is shown while files upload. Re-run it any time to ship a
new release. `--spa` and `--notFound` mirror the
[build settings](#build-settings) below; `--environment` defaults to
`production`.

To upload **without** deploying — for scripting, or to deploy the release
yourself — `deploys site publish` prints just a `site://` release ref. For a
throwaway, auto-deleting deploy, use `deploys site preview` (see
[Preview deployments](#preview-deployments)).

## Build settings

These inputs only apply when `mode: static`:

| Input | Default | Description |
|---|---|---|
| `framework` | `auto` | `auto` (detect Hugo, else Node), `hugo`, `node`, or `none` |
| `buildCommand` | per framework | Build command. Defaults to `hugo` / `npm run build`; **required** when `framework: none` |
| `outputDir` | `public` | Folder of built files to publish (`public` for Hugo, often `dist`/`build` for Node) |
| `nodeVersion` | `.nvmrc` else `20` | Node version for the `node` framework |
| `spa` | `false` | Serve `index.html` for unknown routes — turn on for client-routed SPAs |
| `notFound` | `404.html` | Custom 404 document served on a miss when `spa: false` |
| `workingDirectory` | `.` | Root of the app to build, for monorepos (e.g. `sites/marketing`) |
| `baseUrl` | the deploy URL | Build-time base URL; left empty, the action injects the deploy's own host so `sitemap.xml` and feeds get the right URL |

`env`, `envGroups`, and `pullSecret` are ignored for static deployments —
there's no runtime container to read them.

### Examples

A Vite / React single-page app:

```yaml
- uses: deploys-app/build-deploy-action@v1
  with:
    project: acme
    location: gke.cluster-rcf2
    name: app
    mode: static
    framework: node
    buildCommand: npm run build
    outputDir: dist
    spa: true
```

A site with no framework preset — just run a command and publish a folder:

```yaml
- uses: deploys-app/build-deploy-action@v1
  with:
    project: acme
    location: gke.cluster-rcf2
    name: docs
    mode: static
    framework: none
    buildCommand: make build
    outputDir: site
```

## Caching

The release manifest records a cache class per file, and the gateway serves
each blob accordingly:

- **Fingerprinted assets** (hashed filenames like `app.4f2a.js`) are served
  `immutable` with a one-year max-age — a browser or edge never re-fetches them.
- **HTML and clean URLs** are always revalidated (`must-revalidate`), with the
  blob's hash as the `ETag` so an unchanged page costs a cheap `304`.

Because releases are content-addressed, a new deploy publishes new blobs and
flips the pointer — there's no cache to purge.

{{< callout type="warning" >}}
Turning on [access control](/deployments/access/) (Require Google login) on a
static site **forfeits edge caching** — a gated host can't be cached at the edge
without leaking pre-auth content, so every request proxies fresh. Keep public
sites public to keep them fast.
{{< /callout >}}

## Response headers

Beyond the [cache headers](#caching) above, the gateway stamps a fixed set of
headers on every response that serves your site — any page, asset, or 404 page.
They're built in, not configurable per deployment:

| Header | Value | Set on |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | every served response |
| `X-Frame-Options` | `DENY` | every served response |
| `X-Robots-Tag` | `noindex` | HTML responses of **preview** releases only |

`X-Robots-Tag: noindex` keeps previews out of search results. It's set only when
**both** are true: the response is HTML (`Content-Type: text/html`, which
includes the built-in 404 page), **and** the release's environment is not
`production`. A **production** release carries no `X-Robots-Tag` at all, so it's
indexable; any other environment value — a PR's `pr-<n>`, a `preview`, or
anything else — is served `noindex`. Non-HTML assets (CSS, JS, images) never get
the header.

The environment is set at publish time and **defaults to `production`**, so an
ordinary site is indexable with no configuration and previews stay out of search
engines automatically:

- A push to your default branch (the [GitHub action](/automation/deploy-from-github/))
  and a plain `deploys site deploy` both publish as `production` — **indexable**.
- A pull-request deployment (`<name>-pr-<number>`) and `deploys site preview`
  publish a non-production environment — **`noindex`**.

## Per-release immutable URLs

A static deployment is reachable at **two** hostnames:

- The **default URL** (the deployment's managed `*.deploys.app` hostname) always
  serves the **current** release. Publishing or rolling back re-points it — it's
  deliberately mutable, so "the site" is always the latest build.
- A **release URL** is pinned to **one exact release** and never moves. Its
  hostname embeds the first 8 characters of the release-sha
  (`<name>-<release8>-…`), so a given build keeps a stable address even after
  newer deploys. Use it to link a specific build in a changelog or pull request,
  or to compare two builds side by side.

Both are returned by `deployment.get` (`url` and `releaseUrl`) and shown on the
console's deployment **Details** page. A release URL carries the **same access
posture as the default URL**: for a public site it's public (and
content-addressed — it can only ever serve its own build's files — so treat it
as shareable-but-unlisted); for a site with
[access control](/deployments/access/) ("Require Google login") the release URL
is gated by the same login, so a private site is **never** exposed through its
per-release URLs.

{{< callout type="note" >}}
**Release URLs are immutable but not eternal.** A release URL stays live only
while its revision is **retained** — Deploys.app keeps the most recent **10**
revisions per deployment. After 10 newer deploys the old release is
garbage-collected and its URL 404s. Link a release URL for review and iteration,
not as a permanent archive.
{{< /callout >}}

## Preview deployments

A static site opened in a **pull request** gets its own preview deployment
(`<name>-pr-<number>`) with a public URL and a sticky PR comment, deleted when
the PR closes. Preview releases are served `noindex` so search engines never
index them — see [Response headers](#response-headers). See also
[Deploy from GitHub → pull requests](/automation/deploy-from-github/#what-happens-on-a-pull-request).

The same throwaway-preview loop is available to **any caller** — a local agent,
a script, or the CLI — without a pull request. Publish the build with a
non-production environment (so it's served `noindex`), then deploy it with a
**TTL** so it auto-deletes when the window expires:

{{< code file="preview.sh" lang="bash" >}}
# publish ./public, deploy it as a 2h throwaway preview, print url + releaseUrl
deploys site preview --project acme --name website-preview --dir ./public --ttl 7200
{{< /code >}}

`deployment.get` returns the rolling `url` and the immutable `releaseUrl`. The
preview deletes itself at the TTL; `deploys deployment extend-ttl` re-stamps the
window to keep it alive during a long session, and `deploys deployment delete`
drops it early. Over MCP/API the same flow is `deployment.deploy` with a `ttl`
plus `deployment.extendTTL` — see
[the MCP preview recipe](/automation/mcp/#ship-a-throwaway-preview). Previews and
their release URLs share the 10-revision retention noted above.
