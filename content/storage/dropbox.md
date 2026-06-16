---
title: 'Dropbox'
linkTitle: 'Dropbox'
weight: 2
description: 'Temporary file storage — upload a file, get a short-lived public download URL.'
lead: 'Dropbox is temporary file storage for a project. Upload a file and you get back a public, signed download URL that expires on its own — a day by default, up to seven. Good for handing someone a build artifact, sharing a generated report, or staging an archive to publish — without standing up a bucket or minting long-lived credentials.'
---

## When to reach for it

A disk is for data a deployment keeps. Dropbox is the opposite: a file you want
to *get out* of the platform briefly and then forget about.

- **Share an artifact** — a build output, a database dump, a log bundle — with
  someone who just needs a link, not an account.
- **Hand a generated file to a human** — an export or report produced by a job,
  surfaced as a URL they can click.
- **Stage a static-site archive** — upload a `.tar.gz`, then point
  [static-site publishing](/deployments/static-sites/) at the returned URL.

Every file carries a **TTL of 1–7 days** (default 1). Once it expires the link
stops working and the bytes are reclaimed — there's no manual delete and no way
to extend a TTL. If you need a file to live longer, re-upload it.

The download URL is signed: a tampered or made-up token is rejected before it
ever touches storage, so a link only works if it came from a real upload. But
the URL itself is the only credential — anyone who has it can download the file
until it expires. Treat a Dropbox link like a secret, and don't use Dropbox for
anything you need to keep private indefinitely.

## The Dropbox page

Open **Dropbox** in a project to upload files and see what's currently stored.

{{< shot src="/img/dropbox-list.png" url="console.deploys.app/dropbox?project=acme" alt="Dropbox: a drop zone above a list of four uploaded files, each with a download URL, size, and expiry" caption="Drop a file in, get a shareable URL. Each row shows the file's size, when it went up, and when it expires." >}}

Drag a file onto the drop zone (or click to browse) and hit **Upload**. The new
file appears in the list below with its download URL — copy it with the clipboard
button, or open it in a new tab. Each row shows the size, the upload time, and
when the link expires.

The **Usage** button (top right) opens charts for the project's Dropbox
**egress** (bytes downloaded) and **storage** (bytes held) over the last 7, 30,
or 90 days.

## Upload from the API

Uploads are a raw `POST` to the Dropbox service — not a JSON-RPC action — so they
live on their own host, `https://dropbox.deploys.app/`. The request carries your
normal Bearer token; the caller needs the `dropbox.upload` permission on the
project.

```bash
curl -fsS -X POST \
  "https://dropbox.deploys.app/?project=acme&ttl=3&filename=build.tar.gz" \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  --data-binary @build.tar.gz
```

| Query param | | Description |
|---|---|---|
| `project` | required | Project ID the upload is authorized and billed against |
| `ttl` | optional | Lifetime in days, 1–7 (default 1) |
| `filename` | optional | Name recorded in `Content-Disposition` for the download |

The same values can be passed as `param-project` / `param-ttl` / `param-filename`
headers instead; query params win when both are present. A successful response is
JSON:

```json
{
  "ok": true,
  "result": {
    "downloadUrl": "https://dropbox.deploys.app/files/<token>",
    "expiresAt": "2026-06-19T08:00:00Z"
  }
}
```

On an auth or validation failure the service still answers `200` but with
`{"ok": false, "error": {"message": "…"}}` — check the `ok` field, not just the
HTTP status.

### From Go

The [typed client](/api/conventions/#typed-clients) wraps the upload in a helper
that returns the URL, expiry, and byte count:

```go
res, err := c.DropboxUpload(ctx, &client.DropboxUploadOptions{
    Project:  "acme",
    Content:  content,        // the file bytes
    Filename: "build.tar.gz", // optional
    TTLDays:  3,              // 1–7, default 1
})
// res.DownloadURL, res.ExpiresAt, res.Size
```

This is exactly what static-site publishing uses internally: upload an archive,
then pass `res.DownloadURL` to `PublishSite`.

## List and meter from the CLI

The [`deploys` CLI](/automation/cli/) exposes the read side — listing stored
files and pulling usage metrics. (Uploading is done through the console or the
API above.) Both require the `dropbox.list` permission.

```bash
# everything currently stored in the project
deploys dropbox list --project acme

# narrow by upload time, cap the count
deploys dropbox list --project acme \
  --after 2026-06-01 --before 2026-06-15 --limit 20

# egress + storage over the last 30 days (7d / 30d / 90d)
deploys dropbox metrics --project acme --time-range 30d
```

`list` returns each file's download URL, filename, size, TTL, and its created /
expires timestamps — the same view the console shows.

## Permissions

| Permission | Grants |
|---|---|
| `dropbox.upload` | Upload files to the project |
| `dropbox.list` | List stored files and read usage metrics |

Grant these through a [role](/access/roles/) like any other permission.
