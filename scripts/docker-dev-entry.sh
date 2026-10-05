#!/bin/sh
# Entry point for the api and web dev containers (compose.yaml). Installs dependencies into the
# container's own node_modules volume when the lockfile, Node version or CPU architecture changed,
# then runs the given command. The host's node_modules can't be reused: esbuild and dbmate ship
# per-platform binaries. Install scripts are skipped (ST-32); the packages these apps need at dev
# time take their binaries from optional dependencies instead.
set -eu

lock_hash=$({ cat package-lock.json; node -v; uname -m; } | sha256sum | cut -d' ' -f1)
if [ "$(cat node_modules/.lock-hash 2>/dev/null || true)" != "$lock_hash" ]; then
  echo "installing dependencies in $(pwd)"
  npm ci --ignore-scripts --no-audit --no-fund
  echo "$lock_hash" > node_modules/.lock-hash
fi

exec "$@"
