---
title: A streamed backup (pg_dump | age | aws s3 cp -) uploads a truncated dump when pg_dump fails, and Object Lock keeps it
date: 2026-10-06
type: tooling
module: deploy (backups)
severity: high
tags: [backup, pg-dump, age, s3, object-lock, pipefail, shell, restore-drill]
applies_when: writing a backup or export script that pipes a producer into an uploader, especially to a write-once bucket
---

# Upload a backup only after the whole pipeline succeeded

> The `deploy/backup.sh` described here was removed with the rest of the deploy tooling (restore it from the `pre-p9` tag). The lesson applies to any future backup or export script.

## What happened
`deploy/backup.sh` first streamed the dump straight to S3:

```bash
set -euo pipefail
pg_dump --format=custom | age --encrypt --recipient "$AGE_RECIPIENT" | aws s3 cp - "s3://$BACKUP_BUCKET/$key"
```

If `pg_dump` dies partway (a dropped connection, a killed process), `aws s3 cp -` sees a normal end of stream and finishes the upload. `pipefail` fails the script only after the object already exists under a normal-looking key.

The backup bucket uses S3 Object Lock for 30 days, and the backup IAM user is denied `DeleteObject`, so nobody can remove the broken object. `deploy/restore-drill.sh` and the runbook restore the newest key by default, so the next restore would pick the truncated one. The code review caught it; no test had.

## What to do
Write the encrypted output to a temp file, and upload only when every stage of the pipeline exited 0:

```bash
encrypted=$(mktemp "${TMPDIR:-/tmp}/housing-backup.XXXXXX")
trap 'rm -f -- "$encrypted"' EXIT
pg_dump --format=custom | age --encrypt --recipient "$AGE_RECIPIENT" >"$encrypted"   # pipefail stops here on failure
aws s3 cp "$encrypted" "s3://$BACKUP_BUCKET/$key" --only-show-errors
```

Only age's ciphertext touches the disk, so "no plaintext dump on disk" still holds. The heartbeat call comes after the upload, so a failed run never reports success.

## Why
- A pipe has no way to tell the reader that the writer failed. The reader just gets end of stream.
- `pipefail` changes the pipeline's exit status, but every stage has already run to completion.
- Uploaders that accept stdin (`aws s3 cp -`, `curl -T -`, `rclone rcat`) treat end of stream as success.
- On a normal bucket the result is a bad object someone can delete. On a write-once bucket it is permanent.

## How to prevent it
- Never stream into a write-once or "newest wins" destination. Stage the output, check the exit status, then upload.
- Test the failure path, not only the happy one. Run the script with a wrong database password and assert that the bucket gets no new object and no temp file is left. That is how the fix was checked, in a container with a fake `aws` on `PATH`.
- A related trap in the same drill: `verify-restore.sql` first ended with `\quit 3`, but psql's `\quit` takes no exit code, so the check printed FAIL and still exited 0. Under `\set ON_ERROR_STOP on`, a failing check must raise an error (a `do $$ … raise exception … $$` block) to make psql exit non-zero.

## Files
- `deploy/backup.sh`
- `deploy/restore-drill.sh`
- `deploy/sql/verify-restore.sql`
- `docs/operations/runbook.md` (sections 4 and 14)
