---
title: 'Conventions & catalog'
linkTitle: 'Conventions & catalog'
weight: 2
description: 'Naming conventions, partial updates, pagination, and the full function catalog.'
lead: 'Once you know the response envelope, the rest of the API is mostly knowing the names. Functions group into namespaces; common verbs repeat across namespaces with the same shape.'
---

## Naming

Function names are `<namespace>.<action>`. Namespaces are singular and
lowerCamelCase — `deployment`, `serviceAccount`, `workloadIdentity`. Actions
are short verbs:

| Verb | Shape |
|---|---|
| `list` | `(project[, location])` → `{ items: […] }` |
| `get` | `(project, …id fields)` → the resource |
| `create` | `(project, …spec)` → resource or empty |
| `update` | `(project, …id fields, …spec)` → resource or empty |
| `delete` | `(project, …id fields)` → empty |

For some resources a `list` item is a **reduced, non-sensitive projection** of
what `get` returns, not the full resource — `list` is an index, `get` is the
detail. Most notably `deployment.list` omits the environment, mounted files,
command/args, annotations and the signed log URLs (read them with
`deployment.get`), and `envgroup.list` returns a variable *count* rather than
the values (read them with `envgroup.get`). This is an authorization boundary:
`deployment.list`/`envgroup.list` can be granted without exposing secrets. See
[Roles & permissions](/access/roles/).

Resources scoped to a location (deployments, domains, routes, disks, pull
secrets, workload identities) take both `project` and `location` on every
call. Project-only resources (roles, service accounts, env groups,
audit-log) take only `project`.

## Partial updates

Most `update` calls replace the whole resource — pass the full desired state.
A few resources have a partial-update model because the full state would be
unwieldy to re-state on every change. The biggest one is
[`deployment.deploy`](/deployments/environment-variables/):

- `env` replaces all environment variables.
- `addEnv` / `removeEnv` operate on top of the previous revision's env.
- `envGroups` replaces the list of group references.
- `addEnvGroups` / `removeEnvGroups` operate on top of the previous list.

This same model could appear on other functions in the future; assume
*replace* by default unless the schema explicitly has an `add*` / `remove*`
pair.

## Pagination

List endpoints return all items in one response today. If your project grows
beyond a thousand or so of any resource type, expect pagination tokens to
appear in the response — they'll be added compatibly.

## Idempotency

`create` calls are idempotent on their `(project[, location], name)`: a second
call with the same identifier and the same spec returns success without
creating a duplicate. A second call with a *different* spec is treated as an
update of the existing resource (so be careful — there's no "create only if
not exists" mode).

## Function catalog

The big picture. Each row is a fully-qualified API function.

### Identity

| Function | What it does |
|---|---|
| `me.get` | Current user/service-account profile |
| `me.authorized` | Check if a principal has a given permission |

### Workspace

| Function | What it does |
|---|---|
| `location.list` / `.get` | Clusters available to you |
| `project.list` / `.get` / `.create` / `.update` / `.delete` | Project CRUD |
| `project.usage` | Month-to-date usage for one project |

### Deployments

| Function | What it does |
|---|---|
| `deployment.list` / `.get` | List or fetch deployments |
| `deployment.deploy` | Create or update; rolls out a new revision |
| `deployment.delete` | Delete |
| `deployment.pause` / `.resume` | Stop / restart without losing config |
| `deployment.rollback` | Re-apply an older revision as a new revision |
| `deployment.revisions` | History of revisions |
| `deployment.metrics` | CPU / mem / requests / egress time-series |
| `error.list` / `.get` / `.update` | [Application error issues](/deployments/error-detection/) — list, fetch, and triage |
| `error.create` | [Report an application error](/deployments/error-detection/#reporting-errors-from-your-app--errorcreate) directly from a running deployment |

### Routing

| Function | What it does |
|---|---|
| `domain.list` / `.get` / `.create` / `.delete` | Domain CRUD |
| `domain.purgeCache` | CDN cache purge for a domain |
| `route.list` / `.create` / `.createV2` / `.delete` | Route CRUD |
| `waf.list` / `.get` / `.set` / `.delete` | Firewall zone CRUD (rules + rate limits) |
| `waf.metrics` / `.limitMetrics` | Firewall match counts and rate-limit decisions over time |
| `cache.list` / `.get` / `.set` / `.delete` | Cache-override zone CRUD |
| `cache.metrics` | Cache-override decision counts over time |

### Storage and registry

| Function | What it does |
|---|---|
| `disk.list` / `.get` / `.create` / `.update` / `.delete` | Disk CRUD |
| `disk.metrics` | Disk usage time-series |
| `registry.list` / `.delete` | Repositories in the project |
| `registry.getTags` / `.untag` | Tag inspection and deletion |
| `registry.getManifests` / `.deleteManifest` | Manifest inspection and deletion |
| `registry.metrics` / `.getProjectStorage` | Storage usage |
| `registry.gc` | Garbage-collect manifests no deployment uses (dry-run supported) |
| `pullsecret.list` / `.get` / `.create` / `.delete` | Pull-secret CRUD |

### Access

| Function | What it does |
|---|---|
| `role.list` / `.get` / `.create` / `.delete` | Role CRUD |
| `role.bind` | Set the role list for a principal |
| `role.users` | Who has access to this project |
| `role.permissions` | The catalog of permission strings |
| `serviceaccount.list` / `.get` / `.create` / `.update` / `.delete` | Account CRUD |
| `serviceaccount.createKey` / `.deleteKey` | Key lifecycle |
| `workloadidentity.list` / `.get` / `.create` / `.delete` | GCP federation CRUD |
| `envgroup.list` / `.get` / `.create` / `.update` / `.delete` | Env group CRUD |
| `auditlog.list` | Audit entries with filters |

### Billing

| Function | What it does |
|---|---|
| `billing.list` / `.get` / `.create` / `.update` / `.delete` | Billing account CRUD. The account `type` (`individual`/`company`) drives the Head Office line on tax documents |
| `billing.project` | Set the billing account on a project |
| `billing.report` | Usage rolled up over a date range |
| `billing.listInvoices` / `.getInvoice` / `.downloadInvoice` | Invoices. An invoice carries `taxEntityType` (buyer entity, snapshotted) and, once paid, a `receiptNumber` (`DPLY-RC-YYYYMM-NNNN`) separate from `number`, plus `withholdingTaxRate`/`withholdingTaxAmount` when a company buyer withheld tax |
| `billing.downloadReceipt` | Download the receipt / tax-invoice PDF of a **paid** invoice; shows any withholding-tax deduction |
| `billing.uploadTransferSlip` | Submit a bank-transfer slip (multipart). A company buyer may set `withholdingTax` to declare a 3% deduction and attach the withholding-tax certificate (`whtCert`) |
| `billing.uploadWHTCertificate` | Attach a withholding-tax certificate (`whtCert`, multipart) to an invoice **later** — company invoices only, allowed even after the invoice is paid |

### GitHub

For [build-and-deploy from GitHub](/automation/deploy-from-github/). These manage
the link between a repository and the service account it deploys as.

| Function | What it does |
|---|---|
| `github.list` | Repositories linked in the project |
| `github.link` / `.unlink` | Link or unlink a repository to a service account |
| `github.update` | Change a link's service account, deploy trigger, or production branch |

The keyless token exchange and build/deploy status reporting (`github.exchangeToken`,
`github.notify`) are authenticated by the workflow's GitHub OIDC token and called
by the [build-and-deploy action](/automation/deploy-from-github/), not directly.

### Other

| Function | What it does |
|---|---|
| `email.list` / `.send` | List project email domains; send a transactional email |
| `dropbox.list` / `.metrics` | [Dropbox](/storage/dropbox/) stored files and usage |

## Typed clients

If you're calling the API from Go, the
[`github.com/deploys-app/api/client`](https://github.com/deploys-app/api)
package wraps every function in a typed client — the same client the
`deploys` CLI uses internally.

```go
c := &client.Client{
    Auth: func(r *http.Request) {
        r.Header.Set("Authorization", "Bearer "+token)
    },
}
port := 8080
resp, err := c.Deployment().Deploy(ctx, &api.DeploymentDeploy{
    Project:  "acme",
    Location: "gke.cluster-rcf2",
    Name:     "web",
    Image:    "registry.deploys.app/acme/web:v2.4.1",
    Type:     api.DeploymentTypeWebService,
    Port:     &port,
})
```
