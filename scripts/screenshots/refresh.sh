#!/usr/bin/env bash
# Refresh the console screenshots in assets/img/.
#
# Assumes:
#   - The console repo is cloned at ../../console relative to this script
#     (the deploys-app default).
#   - bun is on PATH (for `bun dev:mock`).
#
# Applies mock-enrichment.patch, starts the mock server, runs the Playwright
# capture, and restores everything. Safe to interrupt — the cleanup trap
# reverts the patch and kills the dev server.

set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
docs=$(cd "$here/../.." && pwd)
# CONSOLE_DIR overrides the sibling-checkout default so a docs worktree can
# point at a console worktree (../../console from .worktrees/docs-* is wrong).
if [[ -n "${CONSOLE_DIR:-}" ]]; then
	console=$(cd "$CONSOLE_DIR" && pwd)
else
	console=$(cd "$docs/../console" && pwd)
fi
patch="$here/mock-enrichment.patch"
mock_file=""
for candidate in src/lib/server/mock.ts src/lib/server/mock.js; do
	if [[ -f "$console/$candidate" ]]; then
		mock_file=$candidate
		break
	fi
done

[[ -d "$console" ]] || { echo "console repo not found at $console" >&2; exit 1; }
[[ -n "$mock_file" ]] || { echo "console mock fixture not found (tried mock.ts / mock.js)" >&2; exit 1; }
[[ -f "$patch" ]] || { echo "patch not found: $patch" >&2; exit 1; }

cd "$console"

# refuse to run if the mock fixture has uncommitted changes — we'd revert them
if ! git diff --quiet -- "$mock_file"; then
	echo "$mock_file has uncommitted changes — commit or stash first." >&2
	exit 1
fi

runner=""
cleanup () {
	[[ -n "${mock_pid:-}" ]] && kill "$mock_pid" 2>/dev/null || true
	[[ -n "$runner" ]] && rm -f "$runner" || true
	git checkout -- "$mock_file" 2>/dev/null || true
}
trap cleanup EXIT

echo "==> applying mock-enrichment.patch (against $mock_file)"
if ! git apply "$patch"; then
	echo "warning: mock-enrichment.patch did not apply; capturing against stock mock fixtures" >&2
fi

echo "==> starting bun dev:mock"
MOCK_API=1 bun run dev --port 5173 > /tmp/console-mock.log 2>&1 &
mock_pid=$!

# wait for :5173 to answer
for _ in $(seq 1 30); do
	if curl -sf -o /dev/null --max-time 2 "http://localhost:5173/"; then break; fi
	sleep 0.5
done

echo "==> capturing screenshots into $docs/assets/img/"
# ESM resolves @playwright/test relative to the source file's location, not
# cwd. Drop capture.mjs into the console repo (which has node_modules) for
# the run; the cleanup trap removes it.
runner="$console/.shot-runner.mjs"
cp "$here/capture.mjs" "$runner"
SHOT_OUT="$docs/assets/img" node "$runner"

echo "==> done"
