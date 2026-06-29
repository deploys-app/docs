---
title: 'Deployment access'
linkTitle: 'Access'
weight: 4
description: 'Put a Google-login gate in front of a deployment — restrict who can reach it by email or domain.'
lead: 'By default a web-facing deployment is public — anyone with the URL can reach it. Deployment access puts a Google sign-in gate in front of it, so only people you allow can load the site. It''s enforced at the edge, before a request ever reaches your container.'
---

## What it does

Turn on **Require Google login** and the platform stops serving the
deployment's public URL to anonymous visitors. Instead, an unauthenticated
request is redirected to sign in with Google; once signed in, the visitor is
checked against your allow-list and either let through or shown a deny page.

It applies to the web-facing types only:

- **[Web service](/deployments/types/#web-service)** — gates the public URL
  (an `internal` web service has no public URL to gate).
- **[Static site](/deployments/static-sites/)** — gates the site (with a
  [caching trade-off](#the-static-caching-trade-off)).

Workers, cron jobs, and internal TCP services have no public HTTP URL, so access control
doesn't apply to them.

## Who gets in

Access is configured with three fields:

| Field | Meaning |
|---|---|
| `requireGoogleLogin` | The switch. `false` (default) = public; `true` = gated. |
| `allowedEmails` | Exact email addresses that may enter. |
| `allowedDomains` | Email domains that may enter (e.g. `acme.com`). |

When the gate is on, a signed-in visitor is allowed if their email is in
`allowedEmails` **or** their email's domain is in `allowedDomains`. Matching is
exact and case-insensitive — `allowedDomains: acme.com` lets in
`dana@acme.com` but not `dana@evil-acme.com`.

{{< callout type="warning" >}}
If you enable the gate but leave **both** lists empty, **any** signed-in Google
account can get in — the gate only proves the visitor is signed in, not that
they're someone you know. Add at least one email or domain to actually restrict
access.
{{< /callout >}}

## Programmatic clients can't bypass it

The gate is an interactive Google sign-in — there's no API key or bearer token
that skips it. That makes it a good fit for internal tools and staging sites,
but it means **API clients, webhooks, and health checks can't authenticate
through a gated public URL.**

For machine-to-machine traffic, reach the deployment over its in-cluster
address instead (e.g. `web.acme.svc.cluster.local`), which isn't gated, or keep
a separate ungated deployment for the API surface.

## Enable it

### From the console

On the deploy form, open the **Access** section, tick **Require Google login**,
and add the allowed emails and domains. The console pre-fills your project's
members so the common case — "just my team" — is one click.

### From the CLI

Pass the access flags to [`deployment deploy`](/automation/cli/):

```bash
deploys deployment deploy \
  --project acme --location gke.cluster-rcf2 \
  --name internal-tool --image registry.deploys.app/acme/tool:v3 \
  --type WebService --port 8080 \
  --requireGoogleLogin=true \
  --allowedDomains acme.com \
  --allowedEmails contractor@example.com
```

Pass `--requireGoogleLogin=false` to make a deployment public again.

### From a GitHub Action

The [`build-deploy-action`](/automation/deploy-from-github/) and the deploy-only
[`deploys-action`](/automation/github-action/) both take access inputs. With
`build-deploy-action`:

```yaml
- uses: deploys-app/build-deploy-action@v1
  with:
    project: acme
    location: gke.cluster-rcf2
    name: internal-tool
    requireGoogleLogin: true
    allowedDomains: acme.com
```

The deploy-only action spells these `accessRequireGoogleLogin`,
`accessAllowedEmails`, and `accessAllowedDomains`.

Access is stored on the deployment, so it survives redeploys — you don't have
to repeat the flags on every rollout. Changes take effect within seconds of the
deploy without restarting your container.

## The static caching trade-off

A [static site](/deployments/static-sites/) earns its speed from aggressive
edge caching. A gated host can't be cached at the edge — a cached response would
leak to anonymous visitors — so enabling the gate makes every request proxy
fresh from storage. Gate a static site when access matters more than latency;
otherwise leave it public.

## How the gate works

The gate runs at the ingress, not in your app:

1. A request to the public URL hits the platform edge, which checks with the
   access verifier (`access.deploys.app`) before forwarding anything upstream.
2. **No valid session** → the visitor is redirected to sign in with Google.
3. After sign-in, the verifier mints a short-lived, signed session cookie
   (scoped to `.deploys.app`) and sends the visitor back to where they started.
4. On each subsequent request the verifier validates the cookie and checks the
   allow-list. **Allowed** → the request is forwarded to your container with a
   trusted `X-Auth-Email` header identifying the visitor. **Not allowed** → a
   deny page.

Because identity arrives as a header your app can trust (the platform strips any
client-supplied copy), a gated app can read `X-Auth-Email` to know who's signed
in without implementing login itself.
