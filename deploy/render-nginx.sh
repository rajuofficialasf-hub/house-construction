#!/usr/bin/env bash
# Renders the housing nginx config into a folder (docs/operations/runbook.md):
#   housing.conf      the server block (box.conf for staging and production, local.conf for local)
#   locations.conf    the UI and API locations shared by both
#   api-proxy.conf    the proxy settings for the API locations
#   ui-headers.conf   the UI security headers and CSP
#   cloudflare.conf   the client IP from Cloudflare (staging and production only)
#
#   deploy/render-nginx.sh <staging|production> <out dir>   needs HOUSING_SERVER_NAME
#   deploy/render-nginx.sh local <out dir>                  needs HOUSING_API_UPSTREAM
#
# Every include points at HOUSING_NGINX_DIR, where the rendered files will live on the server
# (default /etc/nginx/housing/<env>, or /etc/nginx/housing for local). Only the variables listed
# below are substituted, so nginx's own $variables stay as they are.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=deploy/lib.sh
source "$here/lib.sh"

target=${1:-}
out=${2:-}
[[ -n $out ]] || die "usage: render-nginx.sh <staging|production|local> <out dir>"

export HOUSING_ENV=$target
case $target in
  staging | production)
    : "${HOUSING_SERVER_NAME:?HOUSING_SERVER_NAME is not set (the hostname of the site)}"
    port=$(HOUSING_ENV=$target node -p "require('$here/ecosystem.config.cjs').apps[0].env.PORT")
    export HOUSING_API_UPSTREAM=127.0.0.1:$port
    export HOUSING_NGINX_DIR=${HOUSING_NGINX_DIR:-/etc/nginx/housing/$target}
    export HOUSING_WEB_ROOT=${HOUSING_WEB_ROOT:-${HOUSING_ROOT:-/srv/housing}/$target/current/dist}
    export HOUSING_TLS_CERT=${HOUSING_TLS_CERT:-$HOUSING_NGINX_DIR/origin.pem}
    export HOUSING_TLS_KEY=${HOUSING_TLS_KEY:-$HOUSING_NGINX_DIR/origin.key}
    export HOUSING_ORIGIN_PULL_CA=${HOUSING_ORIGIN_PULL_CA:-/etc/nginx/housing/cloudflare-origin-pull-ca.pem}
    server_template=box.conf.template
    ;;
  local)
    : "${HOUSING_API_UPSTREAM:?HOUSING_API_UPSTREAM is not set (host:port of the API)}"
    export HOUSING_NGINX_DIR=${HOUSING_NGINX_DIR:-/etc/nginx/housing}
    export HOUSING_WEB_ROOT=${HOUSING_WEB_ROOT:-/usr/share/nginx/html}
    server_template=local.conf.template
    ;;
  *) die "first argument must be staging, production or local" ;;
esac

# shellcheck disable=SC2016 # envsubst's list of names to replace, not shell expansions
vars='${HOUSING_ENV} ${HOUSING_SERVER_NAME} ${HOUSING_API_UPSTREAM} ${HOUSING_NGINX_DIR} ${HOUSING_WEB_ROOT} ${HOUSING_TLS_CERT} ${HOUSING_TLS_KEY} ${HOUSING_ORIGIN_PULL_CA}'
mkdir -p "$out"
envsubst "$vars" <"$here/nginx/$server_template" >"$out/housing.conf"
envsubst "$vars" <"$here/nginx/locations.conf.template" >"$out/locations.conf"
envsubst "$vars" <"$here/nginx/api-proxy.conf.template" >"$out/api-proxy.conf"
cp "$here/nginx/ui-headers.conf" "$out/ui-headers.conf"
if [[ $target != local ]]; then
  cp "$here/nginx/cloudflare.conf" "$out/cloudflare.conf"
fi
echo "render-nginx.sh: wrote $target config to $out (installs to $HOUSING_NGINX_DIR)"
