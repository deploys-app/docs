---
title: 'Roles & permissions'
linkTitle: 'Roles & permissions'
weight: 2
description: 'Named bundles of permissions you bind to users or service accounts.'
lead: 'A role names a set of permissions. To grant access you create a role, bind it to a user or service account, and the platform checks the permission on every API call.'
---

## The Roles page

The Roles tab lists every role in the project — built-in (`viewer`, `admin`)
and any you've defined.

{{< shot src="/img/role-list.png" url="console.deploys.app/role?project=acme" alt="Role list with Viewer, Deployer, Billing Manager, and Administrator" caption="Roles in the acme project — a viewer, a deployer with CI permissions, a billing-only manager, and an administrator." >}}

## Built-in roles

- **`viewer`** — read-only across the project. Members can list and get
  every resource type but can't change anything.
- **`admin`** — full control. The single permission `*` covers everything,
  including granting other people roles.

These exist by default — you can't delete them.

## Custom roles

Create a role with the exact permissions you want:

```bash
deploys role create \
  --project acme \
  --role deployer \
  --name "Deployer" \
  --permissions "project.get,deployment.list,deployment.get,deployment.deploy,registry.list"
```

The `--permissions` flag takes a comma-separated list of permission strings.
A permission is `<namespace>.<action>`, and unlike the API function names it is
**always lowercase** — the `serviceAccount.createKey` call, for example, is
guarded by the `serviceaccount.key.create` permission. Matching is exact, so the
casing matters: `serviceAccount.createKey` in a role grants nothing. The
authoritative list is whatever `role.permissions` returns; the most useful ones:

| Group | Permissions |
|---|---|
| Project | `project.get`, `project.delete` |
| Deployment | `deployment.list`, `deployment.get`, `deployment.deploy`, `deployment.delete` |
| Domain | `domain.list`, `domain.get`, `domain.create`, `domain.delete`, `domain.purgecache` |
| Route | `route.list`, `route.get`, `route.create`, `route.delete` |
| Firewall (WAF) | `waf.list`, `waf.get`, `waf.set`, `waf.delete` |
| Cache | `cache.list`, `cache.get`, `cache.set`, `cache.delete` |
| Disk | `disk.list`, `disk.get`, `disk.create`, `disk.update`, `disk.delete` |
| Registry | `registry.list`, `registry.get`, `registry.pull`, `registry.push` |
| Pull secret | `pullsecret.list`, `pullsecret.get`, `pullsecret.create`, `pullsecret.delete` |
| Env group | `envgroup.list`, `envgroup.get`, `envgroup.create`, `envgroup.update`, `envgroup.delete` |
| Workload identity | `workloadidentity.list`, `workloadidentity.get`, `workloadidentity.create`, `workloadidentity.delete` |
| Service account | `serviceaccount.list`, `serviceaccount.get`, `serviceaccount.create`, `serviceaccount.delete`, `serviceaccount.key.create`, `serviceaccount.key.delete` |
| Role | `role.list`, `role.get`, `role.create`, `role.delete`, `role.bind` |
| GitHub | `github.list`, `github.link`, `github.unlink`, `github.update` |
| Email | `email.list`, `email.send` |
| Dropbox | `dropbox.list`, `dropbox.upload` |
| Static sites | `site.publish` |
| Audit | `auditlog.list` |

Some actions don't have their own permission — they ride on a broader one.
`deployment.metrics`, `deployment.revisions`, `deployment.rollback`,
`deployment.pause`, and `deployment.resume` are all covered by `deployment.get`
or `deployment.deploy`; `registry.delete` / `deleteManifest` / `untag` are
covered by `registry.push`; `project.usage` and `project.metrics` by
`project.get`. Granting the made-up string does nothing — grant the broader
permission instead.

`.list` and `.get` differ in **what data they return**, not just scope:
`deployment.list` is a non-sensitive index — it returns each deployment's name,
type, status, image and other metadata, but **never** the environment
variables, mounted files, command/args, annotations, or the signed log URLs.
Those require `deployment.get`. Likewise `envgroup.list` returns only the group
names and a variable count, while the values require `envgroup.get`. So a role
with `deployment.list`/`envgroup.list` but not the matching `.get` can enumerate
deployments and env groups **without** reading any secret — a useful split for
dashboards, inventory tooling, or a CI step that only needs to know what exists.

The wildcard `*` matches everything, and each namespace has a `<namespace>.*`
(for example `domain.*`) covering that namespace's actions.

Billing access isn't a project permission: billing calls are authorized by
**ownership of the billing account**, not by a role in the project.

## Binding roles

Bind a role to a user by email, or to a service account by email:

```bash
# add a role to someone
deploys role grant \
  --project acme --role deployer \
  --email engineer@acme.dev

# bind a user to a list of roles in one call (replaces their current set)
deploys role bind \
  --project acme \
  --email engineer@acme.dev \
  --roles "deployer,billing"

# revoke a single role
deploys role revoke \
  --project acme --role admin --email old-admin@acme.dev
```

A person who has been granted access for the first time gets an email invite.
Once they sign in, the next `role.users` call shows their email under the
project.

## Listing who has what

```bash
deploys role users --project acme
```

Returns every email bound to the project with the role IDs they hold. Useful
for periodic audits — pipe it into a script, diff against an expected list,
alert on drift.

## Permission resolution

Permissions are additive: if any role bound to a principal grants the
permission, the call succeeds. There's no explicit deny. To remove a
permission, remove the role that grants it.

The audit log records permission denials too — failed calls show up with
`outcome: forbidden`.

## Patterns

- **Deployer for CI**, restricted to `deployment.deploy` and the read calls
  needed to inspect status. CI never needs to manage roles or delete projects.
- **Viewer for the on-call rotation**, plus `auditlog.list` if you want them to
  debug without changing anything. (Viewer already has `deployment.get`, which
  covers metrics and revisions.)
- **Operator** with everything except `project.delete`, `role.bind`, and
  `serviceaccount.key.create`. Day-to-day powerful, but can't change who has
  access or generate new machine credentials.

Keep `admin` to the smallest practical group; everyone else gets a tailored
role.
