# Shared helpers for the deploy scripts. Sourced, not run.
# shellcheck shell=bash
# shellcheck disable=SC2034 # ENV_NAME, ENV_ROOT and ENV_ETC are read by the scripts that source this.

die() {
  echo "$(basename "$0"): $*" >&2
  exit 1
}

# Checks the environment name and sets ENV_NAME, ENV_ROOT and ENV_ETC.
use_environment() {
  case "${1:-}" in
    staging | production) ENV_NAME=$1 ;;
    *) die "first argument must be staging or production" ;;
  esac
  ENV_ROOT="${HOUSING_ROOT:-/srv/housing}/$ENV_NAME"
  ENV_ETC="${HOUSING_ETC:-/etc/housing}/$ENV_NAME"
}

# Exports every variable in an env file (KEY=value lines) into the current shell.
load_env_file() {
  [[ -r $1 ]] || die "can't read $1"
  set -a
  # shellcheck source=/dev/null
  source "$1"
  set +a
}

# Turns a postgres:// URL in the named variable into PGHOST, PGPORT, PGUSER, PGPASSWORD,
# PGDATABASE and PGSSLMODE, so pg_dump, pg_restore and psql never get the password as an
# argument (it would show in ps; NE-CFG-03).
export_pg_env() {
  local name=$1 key value
  [[ -n ${!name:-} ]] || die "$name is not set"
  # shellcheck disable=SC2016 # the quoted text is JavaScript, not shell
  while IFS='=' read -r -d '' key value; do
    export "$key=$value"
  done < <(URL_VAR=$name node -e '
    const u = new URL(process.env[process.env.URL_VAR]);
    const out = {
      PGHOST: u.hostname.replace(/^\[|\]$/g, ""),
      PGPORT: u.port || "5432",
      PGUSER: decodeURIComponent(u.username),
      PGPASSWORD: decodeURIComponent(u.password),
      PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
      PGSSLMODE: u.searchParams.get("sslmode") ?? "prefer",
    };
    for (const [k, v] of Object.entries(out)) process.stdout.write(`${k}=${v}\0`);
  ')
}
