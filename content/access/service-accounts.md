---
title: 'Service accounts'
linkTitle: 'Service accounts'
weight: 3
description: 'Non-human identities for CI, automation, and anything that needs API credentials.'
lead: 'A service account is a project member that isn''t a person. It can hold roles, sign requests, and own long-lived keys — perfect for CI, monitoring exporters, and back-end tools that talk to the API.'
---

## The Service Accounts page

The Service Accounts tab lists every machine identity in the project — its
email, name, and description.

{{< shot src="/img/service-account-list.png" url="console.deploys.app/service-account?project=acme" alt="Two service accounts: CI Deployer and Metrics Reader" caption="Service accounts in the acme project — a CI deployer and a read-only metrics reader." >}}

Click into one for its keys and current bindings.

## Create a service account

You pick the ID; the email is generated from it as `<id>@<project>.deploys.app`.

```bash
deploys serviceaccount create \
  --project acme \
  --id ci \
  --name "CI Deployer" \
  --description "Used by GitHub Actions to deploy services"
```

Service accounts start with no permissions. Bind a [role](/access/roles/) to
the account's email before it can do anything useful:

```bash
deploys role grant \
  --project acme --role deployer \
  --email ci@acme.deploys.app
```

## Create a key

Roles say *what* the account can do; a key lets it *prove* who it is.

```bash
deploys serviceaccount createkey --project acme --id ci
```

The response contains the key — store it now, because the API never reveals it
again. The console's key creation flow shows the same one-time-display value.

A service account can hold multiple keys; rotate by creating a new one,
distributing it, and deleting the old.

```bash
deploys serviceaccount deletekey --project acme --id ci
```

## Use the credentials

The credentials are a pair: the account email as the **username**, the key as
the **password**. They go in environment variables that every authenticated
tool understands:

```bash
export DEPLOYS_AUTH_USER=ci@acme.deploys.app
export DEPLOYS_AUTH_PASS=…the key…
```

The `deploys` CLI, the [GitHub Action](/automation/github-action/), and direct
API calls (via HTTP Basic) all accept these.

```bash
# direct API call
curl https://api.deploys.app/deployment.list \
  -u "$DEPLOYS_AUTH_USER:$DEPLOYS_AUTH_PASS" \
  -d '{ "project": "acme", "location": "gke.cluster-rcf2" }'

# or with bearer if you've exchanged the key for a token elsewhere
curl https://api.deploys.app/deployment.list \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{ "project": "acme", "location": "gke.cluster-rcf2" }'
```

{{< callout type="warning" >}}
Treat keys like passwords — never check them into a repo. Store them in your
CI secret manager (GitHub Actions secrets, GitLab CI variables, Vault) and
inject them at run time. Rotate them on a schedule and immediately if you
suspect a leak.
{{< /callout >}}

## Update or delete

```bash
deploys serviceaccount update \
  --project acme --id ci \
  --name "CI Deployer (revoked 2026-05-28)"

deploys serviceaccount delete --project acme --id ci
```

Deleting a service account invalidates all of its keys and removes its role
bindings.

## Common patterns

- **One service account per environment + workflow.** `ci@acme` for the staging
  deploy job, `ci@acme-prod` for production. Keep blast radius small and
  rotation easy.
- **One service account per integration.** `metrics-reader` reads metrics,
  `audit-exporter` reads the audit log. Each has just the role it needs and
  its credentials can be revoked independently.
- **Bind to multiple projects.** A service account is created in one project,
  but you can bind it (by email) to roles in other projects — useful for
  shared CI that deploys to staging and production both.
