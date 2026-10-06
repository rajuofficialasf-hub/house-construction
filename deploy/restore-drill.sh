#!/usr/bin/env bash
# Restore drill (docs/operations/runbook.md): restores one environment's backup into a scratch
# database on the staging cluster, checks it with deploy/sql/verify-restore.sql, prints the same
# checks for the live database when SOURCE_DATABASE_URL is given, then drops the scratch database.
# The decrypted dump only ever flows through a pipe.
#
#   deploy/restore-drill.sh <staging|production> [backup key, default: the newest]
#
# Needs, in the environment (never on the box for longer than the drill):
#   BACKUP_BUCKET          the backup bucket
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN (if STS), AWS_DEFAULT_REGION:
#                          a short-lived read credential for <bucket>/<env>/ only
#   AGE_IDENTITY           the age private key file, under /dev/shm; removed when the drill ends
#   DRILL_DATABASE_URL     a role on the staging cluster that may create and drop databases;
#                          its database name is only used to connect
#   SOURCE_DATABASE_URL    optional: the live database to compare with (read-only queries)
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck source=deploy/lib.sh
source ./lib.sh

use_environment "${1:-}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is not set}"
: "${AGE_IDENTITY:?AGE_IDENTITY is not set}"
[[ $AGE_IDENTITY == /dev/shm/* ]] || die "AGE_IDENTITY must be under /dev/shm, so the private key never touches the disk"
[[ -r $AGE_IDENTITY ]] || die "can't read $AGE_IDENTITY"

SCRATCH=housing_restore_drill
cleanup() {
  rm -f -- "$AGE_IDENTITY"
  (export_pg_env DRILL_DATABASE_URL && dropdb --if-exists "$SCRATCH") || echo "restore-drill: drop $SCRATCH by hand" >&2
}
trap cleanup EXIT

key=${2:-}
if [[ -z $key ]]; then
  key=$(aws s3 ls "s3://$BACKUP_BUCKET/$ENV_NAME/" | awk '{print $4}' | grep '\.dump\.age$' | sort | tail -n 1)
  [[ -n $key ]] || die "no backups under s3://$BACKUP_BUCKET/$ENV_NAME/"
  key="$ENV_NAME/$key"
fi
echo "restore-drill: restoring s3://$BACKUP_BUCKET/$key into $SCRATCH"

(
  export_pg_env DRILL_DATABASE_URL
  dropdb --if-exists "$SCRATCH"
  createdb "$SCRATCH"
  export PGDATABASE=$SCRATCH
  aws s3 cp "s3://$BACKUP_BUCKET/$key" - --only-show-errors |
    age --decrypt --identity "$AGE_IDENTITY" |
    pg_restore --no-owner --no-privileges --exit-on-error --dbname "$SCRATCH"
  echo "== restored backup"
  psql --no-psqlrc --quiet --file sql/verify-restore.sql
)

if [[ -n ${SOURCE_DATABASE_URL:-} ]]; then
  (
    export_pg_env SOURCE_DATABASE_URL
    echo "== live database (changes made after the backup show as differences)"
    psql --no-psqlrc --quiet --file sql/verify-restore.sql
  )
fi
echo "restore-drill: passed"
