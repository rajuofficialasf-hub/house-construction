#!/bin/sh
# Entry point for the api and web dev containers (compose.yaml). Installs dependencies into the
# container's own node_modules volume when the lockfile has changed, then runs the given command.
# The host's node_modules can't be reused: esbuild and dbmate ship per-platform binaries.
set -eu

hash=$(sha256sum package-lock.json | cut -d' ' -f1)
if [ "$(cat node_modules/.lock-hash 2>/dev/null || true)" != "$hash" ]; then
  echo "installing dependencies in $(pwd)"
  npm ci --no-audit --no-fund
  echo "$hash" > node_modules/.lock-hash
fi

exec "$@"
