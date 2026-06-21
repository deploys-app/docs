---
title: 'MCP server'
linkTitle: 'MCP (AI assistants)'
weight: 2
description: 'Let Claude and other AI assistants drive Deploys.app through the Model Context Protocol.'
lead: 'The Deploys.app MCP server exposes the whole API to AI assistants like Claude. Ask in plain language — "list my projects", "deploy this image", "what''s my bill this month" — and the assistant finds the right action and runs it as you.'
---

## What it is

[MCP](https://modelcontextprotocol.io) (Model Context Protocol) is the standard
way to give an AI assistant tools. The Deploys.app MCP server is a bridge between
an assistant — [Claude Desktop](https://claude.ai/download),
[Claude Code](https://claude.com/claude-code), or any MCP client — and the
[Deploys.app API](/api/overview/).

It exposes every user-facing action through a **search + execute** pair, so the
~90 API actions never flood the model's context: the assistant searches for the
action it needs, reads its input schema, then runs it on your behalf. It is the
same backend the console and [CLI](/automation/cli/) use, so it can only do what
your identity is allowed to do.

There are two ways to connect. Most people want the first.

## Connect with OAuth (recommended)

No download, no secret to manage — you log in through the browser and the
assistant acts as **your** account.

**Claude Code:**

```bash
# add it to the current project (default scope)
claude mcp add --transport http deploys https://mcp.deploys.app/

# …or make it available in every project on your machine
claude mcp add --transport http --scope user deploys https://mcp.deploys.app/
```

The first time the assistant uses it, a browser window opens for you to sign in
to Deploys.app. After that the connection is remembered. Use `claude mcp list`
to check which servers are configured in the current scope.

**Claude Desktop:** Settings → **Connectors** → *Add custom connector* → set the
URL to `https://mcp.deploys.app/` and complete the sign-in.

Confirm it's connected:

```bash
claude mcp list        # deploys ✓ connected
```

## Connect with a service account (local)

For CI, headless, or offline use — or when you want the assistant to act as a
[service account](/access/service-accounts/) rather than as you — run the server
locally and authenticate with a key.

Download a prebuilt binary (no Go toolchain needed):

| Platform | File |
|---|---|
| macOS (Apple silicon) | `deploys-mcp-darwin-arm64` |
| macOS (Intel) | `deploys-mcp-darwin-amd64` |
| Linux | `deploys-mcp-linux-amd64` / `deploys-mcp-linux-arm64` |
| Windows | `deploys-mcp-windows-amd64.exe` |

```bash
curl -fsSL https://dl.deploys.app/mcp/latest/deploys-mcp-darwin-arm64 -o deploys-mcp
chmod +x deploys-mcp
```

Register it with Claude Code, passing the service-account credentials as env:

```bash
claude mcp add deploys \
  -e DEPLOYS_SA_EMAIL='ci@acme.serviceaccount.deploys.app' \
  -e DEPLOYS_SA_SECRET='…the key…' \
  -- /absolute/path/to/deploys-mcp
```

Add `--scope user` here too to make it available in every project rather than
just the current one.

Or in the Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "deploys": {
      "command": "/absolute/path/to/deploys-mcp",
      "env": {
        "DEPLOYS_SA_EMAIL": "ci@acme.serviceaccount.deploys.app",
        "DEPLOYS_SA_SECRET": "…the key…"
      }
    }
  }
}
```

`DEPLOYS_API_KEY="<email>:<secret>"` works as a single-variable alternative, and
`DEPLOYS_ENDPOINT` overrides the API base URL (mainly for staging).

## How it works

The server exposes exactly two tools:

| Tool | Purpose |
|---|---|
| `deploys_search_actions` | Find actions by intent. Returns matching action ids, descriptions, whether each is read-only or destructive, and the JSON input schema for each. |
| `deploys_execute_action` | Run an action by id with a parameters object. Returns the API's JSON result. |

You don't call these yourself — you just talk to the assistant. It searches for
the action, reads the schema, fills in the parameters, and executes. Actions that
change or delete things are flagged **destructive** so the assistant treats them
with care and confirms before running.

## Examples

Ask in natural language; the assistant maps it to an action:

| You say | Action it runs |
|---|---|
| "list my projects" | `project.list` |
| "show deployments in `acme`" | `deployment.list` |
| "deploy `ghcr.io/acme/web:v2` to `acme` as service `web`" | `deployment.deploy` |
| "roll `web` back to the previous revision" | `deployment.rollback` |
| "what's the usage report for `acme` this month?" | `billing.report` |
| "add the domain `app.acme.com` to `acme`" | `domain.create` |
| "pause the `worker` deployment in `acme`" | `deployment.pause` |
| "restart `web` in `acme`" | `deployment.restart` |

A typical exchange:

```text
You:    show deployments in acme
Claude: (searches → deployment.list → executes)
        6 deployments, all healthy — web services, a couple of cron
        jobs, and a background worker. Want details on any one?
```

## Recipes

### Diagnose a failing deploy

When a `deployment.deploy` comes back with a status that isn't `Success`, the
assistant can close the loop itself — observe, then read the cause:

```text
You:    I deployed web to acme but it's not coming up. What's wrong?
Claude: (deployment.status → sees ready:0, waitingReason CrashLoopBackOff)
        All 3 pods are crash-looping (CrashLoopBackOff, 7 restarts).
        (deployment.logs with previous:true → reads the crashed container)
        The previous container panicked on startup:
          panic: missing env DATABASE_URL
        Add DATABASE_URL to the deployment's env and redeploy.
```

The two actions behind this:

- **`deployment.status`** returns pod counts plus each non-ready pod's raw
  failure reason (`CrashLoopBackOff`, `ImagePullBackOff`, `OOMKilled`, exit
  code) in one call.
- **`deployment.logs`** returns a bounded snapshot of recent **live** container
  output; with `previous: true` it reads the **last crashed container**, which is
  where a `CrashLoopBackOff`'s panic or stack trace lives.
- **`deployment.logsHistory`** returns the **durable** 30-day captured history
  over a `since` / `until` window — oldest-first, or newest-first with
  `reverse: true`, paged with the opaque `cursor`. Reach for it when the pod is
  already gone and live logs have nothing left to read (available only where the
  location has a log bucket configured). It reuses the same `deployment.logs`
  permission.

All three are read-only and return once (no streaming). See
[Monitoring & debugging](/deployments/monitoring/#reading-logs-and-status-programmatically)
for the contract and the `deployment.logs` permission split.

## Permissions & safety

- **It acts as an identity you control.** Over OAuth it's your account; locally
  it's the service account whose key you provided. Either way it's the same
  authentication and [IAM roles](/access/roles/) as the console and CLI — the
  assistant can never exceed what that identity is permitted to do.
- **Scope the service account.** For the local mode, grant the service account
  only the [roles](/access/roles/) it needs, the same as you would for CI.
- **Destructive actions are labelled.** Each action advertises a read-only or
  destructive hint, so deletes, pauses, and rollbacks are gated rather than run
  blindly.

## See also

- [The deploys CLI](/automation/cli/) — the same API from the terminal
- [Service accounts](/access/service-accounts/) — credentials for the local mode
- [API overview](/api/overview/) — the underlying actions
