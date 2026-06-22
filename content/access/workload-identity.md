---
title: 'Workload identity'
linkTitle: 'Workload identity'
weight: 5
description: 'Federate to Google Cloud — let a deployment authenticate as a GCP service account without keys.'
lead: 'Workload identity binds a deployment to a Google Cloud service account. Inside the container, Application Default Credentials work transparently — no JSON key file to mount, no rotation to manage.'
---

## What it does

A workload identity is a named link between a deployment and a Google service
account. When the deployment runs, the platform injects credentials so any
Google Cloud SDK or library that uses **Application Default Credentials**
authenticates as that GSA.

Use it to:

- Read and write Google Cloud Storage buckets.
- Connect to Cloud SQL with IAM authentication.
- Publish to Pub/Sub, read from BigQuery, sign URLs.
- Call any Google API the GSA has been granted.

Without workload identity, the alternative is to mount a JSON service-account
key into the container — possible, but you own rotating and protecting it.
Workload identity removes both responsibilities.

## Create a binding

Pick a name and the GSA email you want the deployment to act as:

```bash
deploys workloadidentity create \
  --project acme --location gke.cluster-rcf2 \
  --name gcs-reader \
  --gsa gcs-reader@acme-prod.iam.gserviceaccount.com
```

You still have to **grant the GSA permission in GCP** to do whatever your app
needs (read a bucket, query a dataset, etc.). The workload identity binding
just lets your container act *as* the GSA; it doesn't give the GSA new powers.

## Attach to a deployment

Reference the binding by name in the deploy config:

```json
{
  "name": "report-builder",
  "image": "registry.deploys.app/acme/report-builder:v1.2.0",
  "workloadIdentity": "gcs-reader"
}
```

Inside the container, Google client libraries pick up credentials
automatically:

```python
from google.cloud import storage
client = storage.Client()                       # picks up ADC
print(list(client.bucket("acme-reports").list_blobs()))
```

```go
import "cloud.google.com/go/storage"
client, _ := storage.NewClient(ctx)             // picks up ADC
```

No key file, no `GOOGLE_APPLICATION_CREDENTIALS` env var.

## Wire up the GCP side

For the binding to work, the GSA must trust the Deploys.app identity provider.
The console shows the exact `gcloud` commands once you create the workload
identity — typically a `gcloud iam service-accounts add-iam-policy-binding`
with the right principal string. Run those in your GCP project, then test from
the deployment.

{{< callout type="tip" >}}
Start with a tiny test deployment (an image that runs `gcloud auth list` or
your client library's identity check) when wiring this up for the first
time. It's much easier to debug than the real workload misfiring.
{{< /callout >}}

## List, inspect, delete

```bash
deploys workloadidentity list --project acme --location gke.cluster-rcf2

deploys workloadidentity get \
  --project acme --location gke.cluster-rcf2 --name gcs-reader

deploys workloadidentity delete \
  --project acme --location gke.cluster-rcf2 --name gcs-reader
```

Deleting a binding takes effect on the deployment's *next* rollout. Existing
pods keep the credentials they had when they started. To force the change
sooner, redeploy or pause-then-resume the deployment.
