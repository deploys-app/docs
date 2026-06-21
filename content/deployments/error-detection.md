---
title: 'Application error detection'
linkTitle: 'Error detection'
weight: 9
description: 'Automatic Sentry-lite error tracking — deploys.app mines your logs for stack traces, or lets your app report errors directly, and groups them into deduplicated issues with counts, a triage lifecycle, and notifications.'
lead: 'Deploys.app reads your deployment''s durable logs for application-level stack traces — Go panics, Java/Python/Node/Ruby exceptions, plus a generic fallback — and groups identical traces into deduplicated issues. Your app can also report its own errors directly via `error.create`, and a reported error merges with a log-mined trace of the same signature into one issue. Each issue carries an occurrence count, first/last-seen, a representative stack, and recent occurrences, with an open → resolved → reopened triage lifecycle. There is nothing you must instrument inside your container.'
---

## What it is

When your app panics or throws, the stack trace it prints to `stdout`/`stderr`
ends up in the logs — and usually scrolls away. Application error detection mines
those logs for stack traces and turns them into **issues**: one issue per distinct
error, deduplicated across every occurrence and every replica.

An issue is everything you'd want to triage an error without grepping logs:

- a **kind** (`go`, `java`, `python`, `node`, `ruby`, or `generic`) and a **title**,
- an **occurrence count** — the true number of times that exact error has fired,
- **first-seen** and **last-seen** timestamps,
- a **representative stack** (the full trace, as the app printed it),
- the **recent occurrences** — the last handful of times it happened, each with the
  pod and timestamp,
- a **status** in its triage lifecycle (see [below](#triage-lifecycle)).

This is the **application** layer of the three "error" surfaces, distinct from the
infrastructure and pod layers:

| Surface | Layer | What it catches |
|---|---|---|
| [`deployment.health`](/automation/notification-channels/#asynchronous-failures-deploymenthealth) / auto-error | infra | no running pods, a deployer apply failure |
| [`deployment.status`](/deployments/monitoring/#reading-logs-and-status-programmatically) | pod | crash-loops, OOM-kills, pod conditions |
| **this** — `error.*` | **application** | **stack traces in your log output, or errors your app reports itself** |

{{< callout type="note" >}}
**Only stack traces become issues.** A lone `ERROR` or `FATAL` log line — one with
no trace attached — is not promoted to an issue; it stays in the
[logs](/deployments/monitoring/#logs) with its severity highlight. Error detection
is about the multi-line traces your runtime prints when something actually crashes
or throws, not about every line that contains the word "error".
{{< /callout >}}

## How it works

Detection runs **server-side**, on the same durable log history that powers
[`deployment.logsHistory`](/deployments/monitoring/#reading-logs-and-status-programmatically) —
so, like that history, it's available **only for locations configured with a log
bucket**, and there's nothing to set up inside your container. The platform
reassembles multi-line traces from the captured log stream, groups identical traces
by a stable fingerprint, and maintains the issue list for you.

Because it works from the captured logs rather than from live output, detection
**lags live output by roughly a minute**. A trace your app just printed shows up in
the [Logs](/deployments/monitoring/#logs) tab immediately, but takes a short while
to surface as an issue. This is a digest, not a real-time tap — when you need the
freshest line, read the [logs](/deployments/monitoring/) directly.

Identical traces are grouped by a fingerprint computed from the stack frames — the
function names and files, not the jittery line numbers or the free-text message — so
the same bug firing a thousand times across every replica is **one** issue with
`count: 1000`, not a thousand rows. The same fingerprint is shared across both
sources: an error your app [reports directly](#reporting-errors-from-your-app--errorcreate)
with `error.create` and a trace the platform mines from your logs land in the **same
issue** when their stack signatures match, so reporting doesn't double-count what the
log miner would have caught anyway.

## Triage lifecycle

An issue moves through a small set of states as it recurs and as you triage it:

| State | Meaning |
|---|---|
| **open** | A live error. New issues start here. |
| **resolved** | You've marked it fixed. It stays resolved until it happens again. |
| **reopened** | A **resolved** issue that occurred again — it *regressed*. The platform flips it back to open automatically and records that it regressed. |
| **muted** | Silenced. It keeps counting occurrences but never fires a notification and is filtered out of the default view. |

You drive the transitions you control — **resolve**, **reopen**, **mute** — from the
console or the API. The **reopen-on-regression** transition is automatic: resolve an
issue, and if that exact error fires again, the platform reopens it for you so a
recurrence never slips by silently.

## The Errors tab

The deployment detail view gains an **Errors** tab (alongside Logs and Events) for
every non-static deployment.

- The **issue list** shows each issue's kind, title, occurrence count, and
  last-seen time, with a status chip. Filter by status — **Open** (the default),
  **Resolved**, **Muted**, or **All** — and sort by last-seen, first-seen, or count.
- The **issue detail** shows the full representative stack and the recent
  occurrences, each linking back to that moment in the deployment's log history.
  **Resolve**, **Mute**, and **Reopen** buttons drive the
  [lifecycle](#triage-lifecycle); they're gated by the `error.update` permission.
- When a deployment has never thrown, the tab reads *"No application errors
  detected."*

## Notifications

A **new** issue, or a **resolved** issue that **regresses**, fires an
[`error.detected`](/automation/notification-channels/) change event. Like every
change event, it's delivered to the project's configured
[notification channels](/automation/notification-channels/) — a webhook, a Discord
channel, or a pull queue. Only those two state transitions fire, so a recurring
error doesn't re-notify on every occurrence, and a **muted** issue never fires at
all.

Subscribe to `error.detected` (or the wildcard `error.*`) on a channel to
route application errors where your team will see them:

```bash
# a Discord channel that pings on any new or regressed application error
deploys notification create --project acme --name app-errors \
  --type discord \
  --url https://discord.com/api/webhooks/123/abc \
  --event error.detected
```

{{< callout type="note" >}}
The notification message carries only the exception **type** (e.g. `panic`,
`java.lang.NullPointerException`) and a `new error:` / `error regressed:` reason —
**never** the full title or the sample/stack. An app's error message can embed
secrets it logged, and a notification payload must stay secret-free. The full title
and the sample stack live behind the `error.get` permission, in the issue itself.
{{< /callout >}}

## API

The `error.*` module backs the Errors tab. Reads are gated by their own
permissions — `error.list` to list issues and `error.get` to fetch an issue with its
stack — because a stack carries the same secret-bearing `stdout` as the
[logs](/deployments/monitoring/#permissions). Triage is gated by **`error.update`**,
and direct reporting by **`error.create`**. All reject `Static` deployments, which
have no logs to mine.

### `error.list` — list issues

| Param | Description |
|---|---|
| `project` | The project id. |
| `location` | The deployment's location. |
| `name` | The deployment name. |
| `status` | `open` (default), `resolved`, `muted`, or `all`. |
| `sort` | `lastSeen` (default), `firstSeen`, or `count`. |
| `limit` | Max issues per page. |
| `cursor` | Opaque pagination cursor from a previous page's `nextCursor`. |

Returns `issues[]` — each `{ id, fingerprint, kind, title, status, count,
firstSeen, lastSeen, samplePod }` — plus a `nextCursor` until the list is
exhausted.

```bash
curl https://api.deploys.app/error.list \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{ "project": "acme", "location": "gke.cluster-rcf2",
        "name": "web", "status": "open", "sort": "count" }'
```

### `error.get` — one issue, with the stack

| Param | Description |
|---|---|
| `project` | The project id. |
| `location` | The deployment's location. |
| `name` | The deployment name. |
| `id` | The issue id from `error.list`. |

Returns the issue with its `sampleMessage` (the full representative stack) and
`recentEvents[]` — each `{ pod, timestamp, object, offset }` pointing at an
occurrence in the captured log history.

```bash
curl https://api.deploys.app/error.get \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{ "project": "acme", "location": "gke.cluster-rcf2",
        "name": "web", "id": "…issue id…" }'
```

### `error.update` — triage

| Param | Description |
|---|---|
| `project` | The project id. |
| `location` | The deployment's location. |
| `name` | The deployment name. |
| `id` | The issue id. |
| `status` | `resolved`, `open` (reopen), or `muted`. |

Flips an issue's [status](#triage-lifecycle). Setting `resolved` marks it fixed;
`open` reopens it manually; `muted` silences its notifications.

```bash
# mark an issue resolved
curl https://api.deploys.app/error.update \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{ "project": "acme", "location": "gke.cluster-rcf2",
        "name": "web", "id": "…issue id…", "status": "resolved" }'
```

## Reporting errors from your app — `error.create`

Log mining catches what your app **prints**. But some errors you'd rather report
explicitly — a handled exception you recover from, an error that never reaches
`stderr`, or one you want to enrich with structured frames from your own SDK.
`error.create` lets a running deployment (or an SDK embedded in it) report its own
application errors directly, instead of relying only on log mining.

A reported error and a log-mined trace with the **same stack signature merge into one
issue** — they share the same [fingerprint](#how-it-works) — so reporting and mining
reinforce each other rather than double-counting.

### Request shape

| Field | Description |
|---|---|
| `project` | The project id. |
| `location` | The deployment's location. |
| `name` | The deployment that's reporting (the deployment name). |
| `events` | The batch of error events — **up to 100** per call. |

Each entry in `events[]`:

| Field | Description |
|---|---|
| `type` | **Required.** The exception type, e.g. `panic`, `java.lang.NullPointerException`. This is the only field that ever appears in a notification. |
| `kind` | One of `go`, `java`, `python`, `node`, `ruby`, `generic`. Defaults to `generic`. |
| `title` | A short human title for the issue. |
| `frames` | The stack frames — each `{ func, file, line }`. The fingerprint is computed from these, so they decide which issue the event merges into. |
| `sample` | A representative full stack/message string for the issue detail. |
| `pod` | The reporting pod name. |
| `ts` | The occurrence timestamp. |

### Auth

The reporting app authenticates as an identity that holds the `error.create`
permission — pick whichever fits how your workload already authenticates, no new
infrastructure either way:

- a project **[service-account key](/access/service-accounts/)** — the same kind of
  key your CI or [MCP](/automation/mcp/) local mode uses; or
- a **scoped token** from `me.generateToken` attenuated to `error.create`. This is
  the least-privilege option: the token can do nothing but report errors, and you can
  keep it short-lived.

{{< callout type="note" >}}
The [notification](#notifications) for a new or regressed issue carries only the
exception **`type`** — **never** the `title` or `sample`, which can echo application
data your app put in the error. Titles and samples stay behind the `error.get`
permission, in the issue itself.
{{< /callout >}}

```bash
# a running app reports one handled exception
curl https://api.deploys.app/error.create \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{ "project": "acme", "location": "gke.cluster-rcf2", "name": "web",
        "events": [
          { "kind": "go",
            "type": "panic",
            "title": "runtime error: invalid memory address or nil pointer dereference",
            "frames": [
              { "func": "main.(*Handler).Serve", "file": "handler.go", "line": 142 },
              { "func": "net/http.(*conn).serve", "file": "server.go", "line": 2092 }
            ],
            "sample": "panic: runtime error: invalid memory address or nil pointer dereference\n\tmain.(*Handler).Serve(...)\n\t\thandler.go:142",
            "pod": "web-7d9c8b6f4-abcde",
            "ts": "2026-06-21T10:04:00Z" }
        ] }'
```

### Kinds

The `kind` field tells you which runtime threw, and drives the icon in the console:

| `kind` | Source |
|---|---|
| `go` | Go panics and `fatal error:` traces |
| `java` | Java / JVM exceptions (`…Exception`, `Caused by:` chains) |
| `python` | Python tracebacks (`Traceback (most recent call last):`) |
| `node` | Node.js / JavaScript errors |
| `ruby` | Ruby exceptions |
| `generic` | A trace the per-language parsers didn't recognize — a best-effort fallback |

## From the CLI and AI assistants

The `error.*` actions are available outside the console too:

- The **CLI** surfaces them under `deploys error` — `list`, `get`, and `update` to
  read and triage issues, plus `deploys error report` to send an `error.create`
  event from a script or CI job without the console.
- The **[MCP server](/automation/mcp/)** exposes the error-listing and error-detail
  tools (and an `error.create` tool), so an AI assistant can pull up a deployment's
  open issues, read the stack, and even report errors as part of a
  diagnose-and-fix loop.

Both wrap the same `error.*` API, so they can only see and do what your identity is
allowed to.

## Retention

Issues are kept for about **30 days after their last occurrence**, matching the
[log history](/deployments/monitoring/#reading-logs-and-status-programmatically)
they're mined from. An issue that stops recurring ages out; one that keeps firing
stays as long as it's active. There's nothing to prune yourself.
