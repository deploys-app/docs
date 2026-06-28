---
title: 'Environment variables'
linkTitle: 'Environment variables'
weight: 6
description: 'Per-deployment env, reusable env groups, and how partial updates work.'
lead: 'Most configuration lives in the environment. Deploys.app lets you set it per-deployment, share it across deployments with env groups, and update slices of it without re-stating the rest.'
---

## Per-deployment `env`

The simplest case — a map on the deployment itself.

```json
{
  "name": "web",
  "image": "registry.deploys.app/acme/web:v2.4.1",
  "env": {
    "NODE_ENV": "production",
    "PORT": "8080",
    "DATABASE_URL": "postgres://…"
  }
}
```

Whatever you pass in `env` *replaces* the entire env map on the new revision.
If you only want to nudge a couple of values, use the partial fields below.

## Reusable env groups

An **env group** is a named bag of variables you can attach to multiple
deployments. Changing the group's values stores them but does **not** restart
anything by default — each deployment picks the new values up on its next deploy.

To roll the change out immediately, set `redeploy: true` on `envgroup.update`
and every deployment that uses the group is redeployed to a new revision. In the
console this is the **Update and redeploy** button (the plain **Update** button
just stores the values). Paused deployments are left untouched and pick up the
new values when you resume them.

Because `redeploy: true` rolls a new revision out to running deployments, it
requires the `deployment.deploy` permission in addition to `envgroup.update`. A
caller that holds only `envgroup.update` can still change the stored values
(leaving `redeploy` unset, or `false`).

```bash
# create or update a group (replaces its contents)
curl https://api.deploys.app/envgroup.create \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{ "project": "acme", "name": "shared",
        "env": { "LOG_LEVEL": "info", "REGION": "apac" } }'
```

In a deployment, reference the group by name:

```json
{
  "name": "api",
  "envGroups": ["shared", "secrets-staging"],
  "env": { "PORT": "8080" }
}
```

When the container starts, the platform merges the groups (in the order
listed) and then the deployment's own `env` on top. Last write wins, so the
deployment's own `env` always overrides what came from a group.

{{< callout type="note" >}}
Env groups are scoped to the project. The same group name in a different
project is a different group.
{{< /callout >}}

## Partial updates — `addEnv`, `removeEnv`

The `deployment.deploy` API has four partial-update fields that operate on the
*previous revision's* env instead of replacing it. Use them when you just want
to rotate a secret or add one new variable.

| Field | Effect |
|---|---|
| `addEnv` | Map: keys added (or overwritten) on top of the previous revision's env. |
| `removeEnv` | List of keys: removed from the previous revision's env. |
| `addEnvGroups` | List of group names: appended to the previous revision's `envGroups`. |
| `removeEnvGroups` | List of group names: removed from the previous revision's `envGroups`. |

```bash
# rotate one secret on web without re-stating everything else
curl https://api.deploys.app/deployment.deploy \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{
    "project": "acme",
    "location": "gke.cluster-rcf2",
    "name": "web",
    "addEnv": { "API_KEY": "new-value" }
  }'
```

If you pass *both* a partial field (`addEnv`) and the full one (`env`), the
full one wins — `env` is treated as a complete replacement.

## What ends up in the container

At rollout time the platform computes the final env like this:

{{< steps >}}
{{< step title="Start with the previous revision's env" >}}
Only if you used a partial field (`addEnv` / `removeEnv` / `addEnvGroups` /
`removeEnvGroups`). Otherwise start empty.
{{< /step >}}
{{< step title="Apply the env groups" >}}
For each group in `envGroups`, merge its current contents in order.
{{< /step >}}
{{< step title="Apply the deployment's own env on top" >}}
The deployment's `env` map wins over anything a group set with the same key.
{{< /step >}}
{{< /steps >}}

The result becomes part of the new revision and is what container processes
see in their environment.

## Sensitive values

Values are stored as-is, encrypted at rest, and never appear in the audit log
or in metrics. They *are* visible to anyone with read access to the
deployment, so make sure your [roles](/access/roles/) limit who can call
`deployment.get` on projects that hold production secrets.

`deployment.get` — not `deployment.list` — is the boundary. **`deployment.list`
is a non-sensitive index:** it returns each deployment's name, type, status,
image, replicas and other metadata, but **never** `env`, `mountData`,
`command`/`args`, annotations, or the signed log URLs. To read the environment
of a deployment you must call `deployment.get` on it. The same split applies to
env groups: **`envgroup.list` returns only the group names and a count of
variables** (`envCount`), never the values — call `envgroup.get` to read them.
So a role with `deployment.list`/`envgroup.list` but not the matching `.get`
can enumerate deployments and env groups without seeing any secret.

A common pattern: keep secrets in a dedicated env group per environment
(`secrets-staging`, `secrets-prod`), and grant read on those groups only to
operators and CI.
