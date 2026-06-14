---
title: 'Deploy from GitHub'
linkTitle: 'Deploy from GitHub'
weight: 3
description: 'Build and deploy straight from a GitHub repository — keyless OIDC auth, production deploys on push, preview deployments on every PR.'
lead: 'The deploys-app/build-deploy-action builds your repository on GitHub''s runners and deploys the result in one step. There are no secrets to store: authentication is keyless via GitHub Actions OIDC. Pushing to the default branch deploys to production; every pull request gets a temporary preview deployment with its own URL.'
---

## What you get

- **Production deploys on push** — every push to the default branch builds the
  repo and rolls out a new revision.
- **Preview deployments on pull requests** — each PR gets its own deployment
  (`<name>-pr-<number>`) with a public URL, a sticky comment on the PR, and a
  GitHub deployment status. Previews are deleted automatically when the PR
  closes.
- **No secrets in the repo** — the workflow authenticates with its GitHub
  OIDC token. There is no service-account key to create, store, or rotate.

If you already build and push images elsewhere and only need a deploy step,
the simpler [deploys-action](/automation/github-action/) (deploy-only,
service-account secrets) still works fine.

## One-time setup

{{< steps >}}
{{< step title="Create a service account" >}}
The action deploys *as* a [service account](/access/service-accounts/) in your
project. It's just an identity here — you never create a key for it.

```bash
deploys serviceaccount create \
  --project acme \
  --id ci \
  --name "GitHub Deployer"
```

Give it a [role](/access/roles/) with the permissions the action uses:

```bash
deploys role create \
  --project acme --role github-deployer --name "GitHub Deployer" \
  --permissions "deployment.deploy,deployment.get,deployment.delete,registry.push"

deploys role grant \
  --project acme --role github-deployer \
  --email ci@acme.serviceaccount.deploys.app
```

`deployment.delete` is what lets the action clean up preview deployments when
a PR closes; `registry.push` lets it push the built image to your project's
[registry](/registry/overview/).
{{< /step >}}
{{< step title="Link the repository to the project" >}}
The link is what ties a GitHub repository to a project and a service account —
it's the authorization the token exchange checks against. Open the console's
**GitHub** page and click **Link repository**. The flow has two steps:

1. **Install the GitHub App** — click the install button, pick the repository
   (or the whole organization) on GitHub, and GitHub redirects you back to the
   console automatically. The console remembers the installation, so you won't
   need to reinstall next time.
2. **Pick the repository** — choose it from a searchable dropdown of the
   repositories visible to the installed App (just created the repo? hit
   **Refresh** to re-fetch the list), choose the service account you created
   above, set the **Production branch**, and click **Link**.

The App is also how the action posts the preview comment and deployment
statuses on pull requests. Prefer the terminal? `deploys github link` does the
same once the App is installed.
{{< /step >}}
{{< /steps >}}

## Production branch

Each link has a **Production branch** setting, chosen at link time in the
console. It defaults to `main`; leave it empty to allow production deploys
from any branch.

When set, the platform only accepts production deploys from that branch: the
token exchange refuses push-event workflow runs from any other ref (including
tags). Pull-request previews are unaffected — they stay allowed from any
branch. The generated workflow's `on.push.branches` matches the configured
branch automatically.

To change the production branch later, unlink the repository and link it
again.

## Add the workflow

One file, one step. The `id-token: write` permission is the credential — the
workflow won't authenticate without it.

{{< code file=".github/workflows/deploy.yml" lang="yaml" >}}
name: Deploy
on:
  push:
    branches: [main]
  pull_request:

permissions:
  id-token: write   # required — this is the credential
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: deploys-app/build-deploy-action@v1
      with:
        project: my-project
        location: gke.cluster-rcf2
        name: web
        port: 3000
{{< /code >}}

{{< callout type="tip" >}}
After linking, the console's **GitHub** page can generate this file for you,
pre-filled with the project, location, and deployment name — use the **Copy**
button, or **Create on GitHub** to open GitHub with the workflow file
pre-filled.
{{< /callout >}}

The example uses `main`; the generated workflow sets `on.push.branches` to
whatever production branch the link is configured with.

Push to `main` and the action builds the image from the repo's Dockerfile,
pushes it to the project registry, and deploys it as `web`.

## What happens on a pull request

When the workflow runs for a pull request, the action deploys a **preview**
instead of touching production:

- The deployment is named `<name>-pr-<number>` — `web-pr-42` for PR #42 — and
  gets its own URL.
- The action posts a sticky comment on the PR with the preview URL, the image,
  and the commit it was built from. Repeated pushes update the same comment,
  not a new one per push.
- A GitHub deployment status is created, so the PR shows a **View deployment**
  button.
- Each push redeploys the same preview in place and re-rolls its TTL.

Previews are temporary by design. They're deleted automatically when the PR is
closed or merged; the TTL (default 7 days since the last push, configurable
with `previewTtl`) is the backstop for previews that never get cleaned up.

## Inputs and outputs

| Input | Required | Description |
|---|---|---|
| `project` | yes | Project ID |
| `location` | yes | Location ID (e.g. `gke.cluster-rcf2`) |
| `name` | yes | Deployment name |
| `context` | no | Build context directory (default `.`) |
| `dockerfile` | no | Path to the Dockerfile |
| `buildArgs` | no | Docker build args |
| `port` | no | Port the container listens on (default `8080`) |
| `type` | no | [Deployment type](/deployments/types/) — `WebService` (default), `Worker`, `TCPService`, `InternalTCPService` |
| `env` | no | Environment variables, one `KEY=VALUE` per line |
| `previewTtl` | no | How long an idle preview lives (default `7d`) |
| `apiEndpoint` | no | Override the API endpoint |
| `registry` | no | Override the registry to push to |

The action exposes outputs you can use in later steps — handy for smoke tests
against the deployed URL:

| Output | Description |
|---|---|
| `url` | URL of the deployment that was created or updated |
| `deployment` | Deployment name (including the `-pr-<n>` suffix for previews) |
| `environment` | `production` or `preview` |
| `image` | The image that was built and deployed |

## How authentication works

The workflow requests a GitHub OIDC token with audience `https://deploys.app`
and exchanges it at the Deploys.app API for a short-lived (1 hour) token
scoped to the service account the repository is linked to. The same token
authenticates the registry push. The build runs entirely on GitHub's runners —
only the built image reaches Deploys.app.

## Limitations and troubleshooting

- **No previews from forks.** GitHub does not issue OIDC tokens to workflows
  triggered by pull requests from forks, so fork-opened PRs can't
  authenticate. This is a GitHub restriction, not a setting.
- **`missing OIDC token support`** — the workflow doesn't have
  `permissions: id-token: write`. Add it at the workflow (or job) level.
- **`token exchange failed … is this repository linked`** — the repository
  isn't linked to a project. Create the link (step 3 above).
- **`github app is not installed on the repository`** — install the
  Deploys.app GitHub App on the repo first, then link it.
- **Name too long** — deployment names cap at 63 characters *including* the
  `-pr-<n>` suffix on previews. Keep the base `name` short enough to leave
  room.
