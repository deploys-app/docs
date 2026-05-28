# Console screenshots

The console screenshots in `static/img/` (`deployment-list.png`,
`deploy-form.png`, …) are captured locally from the console's mock server.
They reference real, branded fixtures, not the spartan defaults `bun dev:mock`
ships with — so the screenshots look like a real production project rather
than an empty-state demo.

## What's here

| File | Purpose |
|---|---|
| `mock-enrichment.patch` | Diff against `console/src/lib/server/mock.js` that adds the richer fixtures: 5 deployments, 4 domains, 3 disks, 4 routes, 5 registry repos, 4 roles, 2 service accounts; also fixes the cosmetic `https://https://` URL doubling. |
| `capture.mjs` | Playwright script that drives the console at light-theme and writes PNGs into `../../static/img/`. Handles the deploy form's location → fill interaction. |
| `refresh.sh` | End-to-end helper: applies the patch, starts the mock server, runs `capture.mjs`, then reverts the patch and stops the server (even on interrupt). |

## Refresh the screenshots

From the docs repo root:

```bash
./scripts/screenshots/refresh.sh
```

Prereqs:

- The console repo is cloned alongside this one: `~/Projects/deploys-app/console`
  (or wherever your deploys-app workspace lives — the script resolves it as
  `../console`).
- The console repo's working tree on `src/lib/server/mock.js` is clean (the
  script refuses to run otherwise so it never clobbers your own edits).
- `bun` is on PATH for `bun dev:mock`.
- Playwright Chromium is installed in the console repo (`bunx playwright install`
  if not — the console already ships `@playwright/test`).

`refresh.sh` is idempotent — run it whenever the console UI changes enough
that screenshots drift.

## Refreshing by hand

If you'd rather drive each step yourself:

```bash
cd ~/Projects/deploys-app/console
git apply ~/Projects/deploys-app/docs/scripts/screenshots/mock-enrichment.patch
MOCK_API=1 bun run dev --port 5173

# in a second terminal, from the console repo:
node ~/Projects/deploys-app/docs/scripts/screenshots/capture.mjs

# then put everything back
git checkout -- src/lib/server/mock.js
```

## Why a patch and not a permanent change

The console's `mock.js` is a shared fixture for the whole team; baking
documentation-driven data into it would muddle that role. A patch lives in
the docs repo, where it belongs, and only gets applied when we're capturing
screenshots.

If the patch ever stops applying (the console's `mock.js` evolved), regenerate
it:

```bash
cd ~/Projects/deploys-app/console
git apply ~/Projects/deploys-app/docs/scripts/screenshots/mock-enrichment.patch || true
# …re-apply the bits that conflicted by hand, then:
git diff -- src/lib/server/mock.js > ~/Projects/deploys-app/docs/scripts/screenshots/mock-enrichment.patch
git checkout -- src/lib/server/mock.js
```
