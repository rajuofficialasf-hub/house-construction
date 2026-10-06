#!/bin/sh
# Creates the roles, then the dev and test databases owned by housing_owner. Compose runs it once,
# on the first start of an empty local volume. CI runs it against its Postgres service with the
# standard PG* variables and ROLES_SQL=server/db/roles.sql.
set -eu

roles_sql=${ROLES_SQL:-/housing/roles.sql}
export PGUSER="${PGUSER:-$POSTGRES_USER}"

psql -v ON_ERROR_STOP=1 -d postgres \
  -v owner_password="$HOUSING_OWNER_PASSWORD" \
  -v app_password="$HOUSING_APP_PASSWORD" \
  -f "$roles_sql"

for db in housing housing_test; do
  psql -v ON_ERROR_STOP=1 -d postgres <<SQL
create database $db owner housing_owner;
revoke all on database $db from public;
grant connect, temporary on database $db to housing_app;
SQL
done
