#!/usr/bin/env bash
# Nightly backup of one environment's database: pg_dump as housing_owner, encrypted with age,
# uploaded to S3. Run by PM2 (housing-backup-<env>) and by
# deploy.sh before a production migration. Only age's encrypted output touches the disk, in a temp
# file removed on exit. Retention and immutability are the bucket's job
# (Object Lock and a 30-day lifecycle; docs/operations/runbook.md).
#
#   deploy/backup.sh <staging|production>
#
# Reads /etc/housing/<env>/deploy.env: DATABASE_MIGRATION_URL, BACKUP_BUCKET, AGE_RECIPIENT,
# the backup writer's AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_DEFAULT_REGION, and
# optionally BACKUP_HEARTBEAT_URL (called after a successful upload).
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck source=deploy/lib.sh
source ./lib.sh

use_environment "${1:-}"
load_env_file "$ENV_ETC/deploy.env"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is not set in deploy.env}"
: "${AGE_RECIPIENT:?AGE_RECIPIENT is not set in deploy.env}"
export_pg_env DATABASE_MIGRATION_URL

key="$ENV_NAME/housing-$(date -u +%Y%m%dT%H%M%SZ).dump.age"
# The encrypted dump goes to a temp file first and is uploaded only when pg_dump and age both
# succeeded: a stream cut short would otherwise land in S3 as a normal-looking backup, and Object
# Lock would keep it there.
encrypted=$(mktemp "${TMPDIR:-/tmp}/housing-backup.XXXXXX")
trap 'rm -f -- "$encrypted"' EXIT
pg_dump --format=custom | age --encrypt --recipient "$AGE_RECIPIENT" >"$encrypted"
aws s3 cp "$encrypted" "s3://$BACKUP_BUCKET/$key" --only-show-errors
echo "backup: uploaded s3://$BACKUP_BUCKET/$key"

if [[ -n ${BACKUP_HEARTBEAT_URL:-} ]]; then
  # Through curl's config on stdin: the URL holds the check's secret and would show in ps as an argument.
  printf 'url = "%s"\n' "$BACKUP_HEARTBEAT_URL" |
    curl --config - --fail --silent --show-error --max-time 10 >/dev/null ||
    echo "backup: heartbeat failed" >&2
fi
