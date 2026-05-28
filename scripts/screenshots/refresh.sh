#!/usr/bin/env bash
# Refresh the console screenshots in static/img/.
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
console=$(cd "$docs/../console" && pwd)
patch="$here/mock-enrichment.patch"

[[ -d "$console" ]] || { echo "console repo not found at $console" >&2; exit 1; }
[[ -f "$patch" ]] || { echo "patch not found: $patch" >&2; exit 1; }

cd "$console"

# refuse to run if mock.js has uncommitted changes — we'd revert them
if ! git diff --quiet -- src/lib/server/mock.js; then
	echo "src/lib/server/mock.js has uncommitted changes — commit or stash first." >&2
	exit 1
fi

cleanup () {
	[[ -n "${mock_pid:-}" ]] && kill "$mock_pid" 2>/dev/null || true
	git checkout -- src/lib/server/mock.js 2>/dev/null || true
}
trap cleanup EXIT

echo "==> applying mock-enrichment.patch"
git apply "$patch"

echo "==> starting bun dev:mock"
MOCK_API=1 bun run dev --port 5173 > /tmp/console-mock.log 2>&1 &
mock_pid=$!

# wait for :5173 to answer
for _ in $(seq 1 30); do
	if curl -sf -o /dev/null --max-time 2 "http://localhost:5173/"; then break; fi
	sleep 0.5
done

echo "==> capturing screenshots into $docs/static/img/"
node "$here/capture.mjs"

echo "==> done"
