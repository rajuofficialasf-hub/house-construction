#!/usr/bin/env bash
# Nightly backup of one environment's database: pg_dump as housing_owner, encrypted with age,
# streamed to S3. No unencrypted dump touches the disk. Run by PM2 (housing-backup-<env>) and by
# deploy.sh before a production migration. Retention and immutability are the bucket's job
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
pg_dump --format=custom | age --encrypt --recipient "$AGE_RECIPIENT" | aws s3 cp - "s3://$BACKUP_BUCKET/$key" --only-show-errors
echo "backup: uploaded s3://$BACKUP_BUCKET/$key"

if [[ -n ${BACKUP_HEARTBEAT_URL:-} ]]; then
  curl --fail --silent --show-error --max-time 10 "$BACKUP_HEARTBEAT_URL" >/dev/null || echo "backup: heartbeat failed" >&2
fi
