#!/usr/bin/env bash
# Deploys a git ref to one environment on the box, as that environment's user
# (docs/operations/runbook.md):
#   1. check out the ref into releases/<sha> (a git worktree of repo/)
#   2. install (no install scripts), build the UI with build.env and the server
#   3. production: take a backup first
#   4. migrate as housing_owner with deploy.env
#   5. point current at the release, reload the API and wait for /api/v1/readyz
#   6. if it isn't ready, point current back at the previous release and reload
#
#   deploy/deploy.sh <staging|production> <branch, tag or sha>
#
# Migrations are never rolled back: after the first staging run they are add-only and work with
# the previous release's code. Redeploying an older sha is the rollback.
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck source=deploy/lib.sh
source ./lib.sh

use_environment "${1:-}"
ref=${2:-}
[[ -n $ref ]] || die "second argument must be a branch, tag or sha"
for file in api.env build.env deploy.env; do
  [[ -r $ENV_ETC/$file ]] || die "can't read $ENV_ETC/$file"
done

repo=$ENV_ROOT/repo
releases=$ENV_ROOT/releases
current=$ENV_ROOT/current
mkdir -p "$releases"

git -C "$repo" fetch --quiet --tags --prune origin
sha=$(git -C "$repo" rev-parse --verify --quiet "origin/$ref^{commit}" || git -C "$repo" rev-parse --verify "$ref^{commit}")
release=$releases/$sha
echo "deploy: $ENV_NAME <- $ref ($sha)"

if [[ ! -e $release/.built ]]; then
  [[ $(readlink -f "$current" 2>/dev/null) != "$release" ]] || die "$release is live but not marked built; fix it by hand"
  rm -rf "$release"
  git -C "$repo" worktree prune
  git -C "$repo" worktree add --quiet --detach "$release" "$sha"
  (
    cd "$release"
    npm ci --ignore-scripts --no-audit --no-fund
    npm ci --ignore-scripts --no-audit --no-fund --prefix server
    # sharp loads its prebuilt binary without an install script; fail here, not at the first upload.
    (cd server && node -e "require('sharp')")
    # Only the public VITE_* values; the owner URL and backup keys never reach dependency code.
    (load_env_file "$ENV_ETC/build.env" && npm run build)
    npm --prefix server run build
  )
  touch "$release/.built"
fi

if [[ $ENV_NAME == production ]]; then
  "$release/deploy/backup.sh" "$ENV_NAME"
fi
(load_env_file "$ENV_ETC/deploy.env" && npm --prefix "$release/server" run db:migrate)

port=$(HOUSING_ENV=$ENV_NAME node -p "require('$release/deploy/ecosystem.config.cjs').apps[0].env.PORT")

switch_to() {
  ln -sfn "$1" "$current.next"
  mv -T "$current.next" "$current"
}

reload() {
  HOUSING_ENV=$ENV_NAME pm2 startOrReload "$1/deploy/ecosystem.config.cjs" --only "housing-api-$ENV_NAME" --update-env >/dev/null
}

ready() {
  local _
  for _ in $(seq 1 30); do
    curl --fail --silent --max-time 2 "http://127.0.0.1:$port/api/v1/readyz" >/dev/null && return 0
    sleep 1
  done
  return 1
}

previous=$(readlink -f "$current" 2>/dev/null || true)
switch_to "$release"
reload "$release"
if ! ready; then
  if [[ -n $previous && $previous != "$release" ]]; then
    echo "deploy: $sha isn't ready; switching back to $(basename "$previous")" >&2
    switch_to "$previous"
    reload "$previous"
    ready || echo "deploy: the previous release isn't ready either; see pm2 logs housing-api-$ENV_NAME" >&2
  fi
  die "deploy of $sha failed"
fi
echo "deploy: $ENV_NAME is live on $sha"

# Keep the 5 newest releases, never the live one.
live=$(readlink -f "$current")
while IFS= read -r old; do
  [[ $old == "$live" ]] && continue
  # The release is already live, so a directory that won't go is reported, not a failed deploy.
  git -C "$repo" worktree remove --force "$old" || echo "deploy: could not remove $old" >&2
done < <(find "$releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn | tail -n +6 | cut -d' ' -f2-)
