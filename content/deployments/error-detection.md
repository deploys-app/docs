---
title: 'Application error detection'
linkTitle: 'Error detection'
weight: 9
description: 'Automatic Sentry-lite error tracking — deploys.app mines your logs for stack traces and groups them into deduplicated issues with counts, a triage lifecycle, and notifications.'
lead: 'Deploys.app reads your deployment''s durable logs for application-level stack traces — Go panics, Java/Python/Node/Ruby exceptions, plus a generic fallback — and groups identical traces into deduplicated issues. Each issue carries an occurrence count, first/last-seen, a representative stack, and recent occurrences, with an open → resolved → reopened triage lifecycle. There is nothing to instrument inside your container.'
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
| **this** — `deployment.errors` | **application** | **stack traces in your log output** |

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
`count: 1000`, not a thousand rows.

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
  [lifecycle](#triage-lifecycle); they're gated by the `deployment.logs` permission.
- When a deployment has never thrown, the tab reads *"No application errors
  detected."*

## Notifications

A **new** issue, or a **resolved** issue that **regresses**, fires a
[`deployment.error`](/automation/notification-channels/) change event. Like every
change event, it's delivered to the project's configured
[notification channels](/automation/notification-channels/) — a webhook, a Discord
channel, or a pull queue. Only those two state transitions fire, so a recurring
error doesn't re-notify on every occurrence, and a **muted** issue never fires at
all.

Subscribe to `deployment.error` (or the wildcard `deployment.*`) on a channel to
route application errors where your team will see them:

```bash
# a Discord channel that pings on any new or regressed application error
deploys notification create --project acme --name app-errors \
  --type discord \
  --url https://discord.com/api/webhooks/123/abc \
  --event deployment.error
```

{{< callout type="note" >}}
The notification message carries only the exception **type** (e.g. `panic`,
`java.lang.NullPointerException`) and a `new error:` / `error regressed:` reason —
**never** the full title or the stack. An app's error message can embed secrets it
logged, and a notification payload must stay secret-free. The full title and the
sample stack live behind the `deployment.logs` permission, in the issue itself.
{{< /callout >}}

## API

Three actions back the Errors tab. All are gated by the **`deployment.logs`**
permission — the same one that reads [logs](/deployments/monitoring/#permissions) —
because an issue's stack carries the same secret-bearing `stdout`. They reject
`Static` deployments, which have no logs to mine.

### `deployment.errors` — list issues

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
curl https://api.deploys.app/deployment.errors \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{ "project": "acme", "location": "gke.cluster-rcf2",
        "name": "web", "status": "open", "sort": "count" }'
```

### `deployment.errorGet` — one issue, with the stack

| Param | Description |
|---|---|
| `project` | The project id. |
| `location` | The deployment's location. |
| `name` | The deployment name. |
| `id` | The issue id from `deployment.errors`. |

Returns the issue with its `sampleMessage` (the full representative stack) and
`recentEvents[]` — each `{ pod, timestamp, object, offset }` pointing at an
occurrence in the captured log history.

```bash
curl https://api.deploys.app/deployment.errorGet \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{ "project": "acme", "location": "gke.cluster-rcf2",
        "name": "web", "id": "…issue id…" }'
```

### `deployment.errorUpdate` — triage

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
curl https://api.deploys.app/deployment.errorUpdate \
  -H "Authorization: Bearer $DEPLOYS_TOKEN" \
  -d '{ "project": "acme", "location": "gke.cluster-rcf2",
        "name": "web", "id": "…issue id…", "status": "resolved" }'
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

The same three actions are available outside the console:

- The **CLI** surfaces them under `deploys deployment errors` (list, get, and
  resolve), so a script or CI job can read and triage issues without the console.
- The **[MCP server](/automation/mcp/)** exposes the error-listing and
  error-detail actions, so an AI assistant can pull up a deployment's open issues
  and read the stack as part of a diagnose-and-fix loop.

Both wrap the same `deployment.logs`-gated API, so they can only see what your
identity is allowed to.

## Retention

Issues are kept for about **30 days after their last occurrence**, matching the
[log history](/deployments/monitoring/#reading-logs-and-status-programmatically)
they're mined from. An issue that stops recurring ages out; one that keeps firing
stays as long as it's active. There's nothing to prune yourself.
