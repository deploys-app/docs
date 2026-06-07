---
title: 'Domains'
linkTitle: 'Domains'
weight: 1
description: 'Attach custom domains, prove you own them, terminate TLS, and serve through the CDN.'
lead: 'A domain represents a custom hostname (or wildcard) you own. Attach it to a project + location, prove ownership with DNS, and the platform terminates TLS, serves it through the CDN, and routes traffic for you.'
---

## The Domains page

The Domains tab in the console lists every custom domain in the project, with
its wildcard flag and the location it's bound to.

{{< shot src="/img/domain-list.png" url="console.deploys.app/domain?project=acme" alt="Domain list: apex, www, api, and a wildcard" caption="Four domains in the same project — a mix of apex, subdomains, and a wildcard." >}}

## Create a domain

You'll set three things:

- **Domain** — the hostname, e.g. `acme.example.com` or `acme.dev` (apex).
- **Location** — the cluster the domain will serve from. The hostname's TLS
  certificate is provisioned in this location.
- **Wildcard** — if `true`, the domain covers `*.host` as well as `host`.

Every domain is served through our CDN edge — there's no separate toggle.

```bash
curl https://api.deploys.app/domain.create \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{
    "project": "acme",
    "location": "gke.cluster-rcf2",
    "domain": "acme.example.com",
    "wildcard": false
  }'
```

The domain is created in a **pending** state. To turn it active, you need to
verify ownership.

## Verify ownership

After creating the domain, the console shows the DNS records you need to add at
your registrar:

- A **TXT** record at `_deploys.<your-domain>` containing the verification
  string. This proves you own the domain.
- A **CNAME** (or A/AAAA records) pointing your domain at the location's
  ingress. The console shows the exact targets for your location — typically a
  `*.deploys.app` CNAME plus IPv4/IPv6 addresses as a fallback.

Once those records propagate, the platform:

1. Reads the TXT record and marks the domain **verified**.
2. Provisions a TLS certificate (Let's Encrypt) using HTTP-01 or DNS-01 — the
   console shows the relevant DCV record while it's in progress.
3. Flips the domain to **active** and starts accepting traffic.

{{< callout type="note" >}}
Wildcard domains require **DNS-01** verification, so you'll also need to add a
`_acme-challenge.<host>` CNAME the console shows you. Apex domains usually
verify with HTTP-01 and don't need that record.
{{< /callout >}}

## Routing traffic

Creating a domain alone doesn't send any traffic to a deployment — you still
need a [route](/networking/routes/) that maps `(domain, path)` to a deployment.

```bash
curl https://api.deploys.app/route.create \
  -d '{ "project": "acme", "location": "gke.cluster-rcf2",
        "domain": "acme.example.com", "path": "/", "deployment": "web" }'
```

## The CDN

Every domain is fronted by our edge cache — it's included, with nothing to turn
on. You get:

- Global PoP routing — TLS terminates at the closest edge to the user.
- Static asset caching with sensible defaults (respects standard
  `Cache-Control`).
- DDoS mitigation and request filtering.

**Purge cache** invalidates cached content for the domain. It's available from
the console and as `domain.purgeCache` in the API. Purge the whole domain, an
exact URL (`file`), or everything under a path (`prefix`):

```bash
# purge the whole domain
curl https://api.deploys.app/domain.purgeCache \
  -d '{ "project": "acme", "domain": "acme.example.com" }'

# purge a single file
curl https://api.deploys.app/domain.purgeCache \
  -d '{ "project": "acme", "domain": "acme.example.com",
        "file": "https://acme.example.com/style.css" }'

# purge everything under a path prefix
curl https://api.deploys.app/domain.purgeCache \
  -d '{ "project": "acme", "domain": "acme.example.com",
        "prefix": "acme.example.com/assets" }'
```

{{< callout type="note" >}}
A wildcard domain can't be purged by host alone — pass a `file` or `prefix` so
the edge knows which concrete host to invalidate.
{{< /callout >}}

## Removing a domain

Deleting a domain also deletes any routes that reference it. The TLS
certificate is revoked and the platform stops accepting traffic. Existing DNS
records will just stop resolving to anything.

```bash
curl https://api.deploys.app/domain.delete \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{ "project": "acme", "location": "gke.cluster-rcf2",
        "domain": "acme.example.com" }'
```

{{< callout type="note" >}}
Domains are managed from the console and the API. The `deploys` CLI doesn't
currently include a `domain` namespace — use the API or the console.
{{< /callout >}}
