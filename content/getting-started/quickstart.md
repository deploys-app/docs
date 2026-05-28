---
title: 'Quickstart'
linkTitle: 'Quickstart'
weight: 2
description: 'Deploy a live, internet-reachable web service in about five minutes.'
lead: 'This walkthrough takes you from an empty project to a running web service with a public HTTPS URL — using the console, with the equivalent CLI commands alongside.'
---

## Before you start

You need a Deploys.app account that belongs to a [billing account](/billing/overview/),
and a container image to run. This guide uses the public `nginx:1.27` image so you
don't need to build anything.

{{< callout type="note" >}}
Prefer the terminal? Every step below has a `deploys` CLI equivalent. Install it
first — see [the CLI guide](/automation/cli/) — then authenticate with a
[service-account key](/access/service-accounts/).
{{< /callout >}}

## Deploy your first service

{{< steps >}}
{{< step title="Create a project" >}}
A project is the workspace your deployment lives in. In the console, open the
project switcher and choose **Create project**, then give it an ID like `acme`.

{{< shot src="/img/project-list.png" url="console.deploys.app/project" alt="Project list in the console" caption="A project groups every deployment, domain, disk, and registry you create." >}}

With the CLI:

```bash
deploys project create --id acme --name "Acme Corp" --billingAccount ba_xxx
```
{{< /step >}}
{{< step title="Pick a location" >}}
A **location** is the cluster your workload runs in. List what's available — the
location's domain suffix becomes part of your public hostname.

```bash
deploys location list
```
{{< /step >}}
{{< step title="Deploy a web service" >}}
In the console, open **Deployments → Deploy** and fill in the image, port, and
resources. The defaults (a small CPU/memory request, autoscaling from 1 replica)
are fine for a first run.

{{< shot src="/img/deploy-form.png" url="console.deploys.app/deployment/deploy?project=acme" alt="Deployment form in the console" caption="The deploy form: image, type, port, resources, and environment in one place." >}}

The equivalent command:

{{< code lang="bash" >}}
deploys deployment deploy \
  --project acme --location gke.cluster-rcf2 \
  --name web --image nginx:1.27 \
  --type WebService --port 80 \
  --minReplicas 1 --maxReplicas 3
{{< /code >}}
{{< /step >}}
{{< step title="Watch it go live" >}}
The deployment list shows rollout status as the new revision becomes healthy.
Once the status icon turns green, your service is reachable at its managed
hostname over HTTPS.

{{< shot src="/img/deployment-list.png" url="console.deploys.app/deployment?project=acme" alt="Deployment list showing a healthy web service" caption="The deployment list — status, type, location, replicas, and the public URL at a glance." >}}
{{< /step >}}
{{< step title="Open the deployment" >}}
Click into the deployment for the detail view: configuration, live logs, metrics,
Kubernetes events, and the revision history you can roll back to.

{{< shot src="/img/deployment-detail.png" url="console.deploys.app/deployment/detail?project=acme&location=gke.cluster-rcf2&name=web" alt="Deployment detail view" caption="One screen for everything about a running workload." >}}
{{< /step >}}
{{< /steps >}}

## What just happened

Behind that single deploy, the platform:

- Pulled your image and scheduled it onto the location's cluster.
- Assigned a managed hostname and provisioned a TLS certificate.
- Started health-checking the pods and only shifted traffic once they were ready.
- Began metering CPU, memory, and egress for [billing](/billing/overview/).
- Recorded the rollout as **revision 1** so you can [roll back](/deployments/revisions-rollbacks/) later.

## Next steps

- Add a [custom domain](/networking/domains/) and [route](/networking/routes/) traffic to your service.
- Move configuration into [environment variables and env groups](/deployments/environment-variables/).
- Wire deploys into CI with the [GitHub Action](/automation/github-action/).
- Learn the [core concepts](/getting-started/concepts/) that tie it all together.
