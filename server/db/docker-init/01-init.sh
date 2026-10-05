#!/bin/sh
# Runs once, on the first start of an empty local volume: creates the roles, then the dev
# and test databases owned by housing_owner.
set -eu

psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
  -v owner_password="$HOUSING_OWNER_PASSWORD" \
  -v app_password="$HOUSING_APP_PASSWORD" \
  -f /housing/roles.sql

for db in housing housing_test; do
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres <<SQL
create database $db owner housing_owner;
revoke all on database $db from public;
grant connect, temporary on database $db to housing_app;
SQL
done
