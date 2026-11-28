#!/usr/bin/env bash
# Remote Linux host only. No public ingress, scheduler, purchases or DNS changes.
set -euo pipefail
umask 077
cd -- "$(dirname -- "$0")/../.."
die() { printf '%s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null || die "Required on remote host: $1"; }
private_file() {
  [[ -f "$1" && ! -L "$1" && "$(stat -c '%a' "$1")" == 600 ]] || die "Private regular file with mode 600 required: $1"
}
read_setting() {
  local name="$1" file="$2" result
  result="$(grep -E "^$name=" "$file")" || die "Missing configuration: $name"
  [[ "$result" != *$'\n'* ]] || die "Duplicate configuration: $name"
  printf '%s' "$result" | cut -d= -f2-
}
prepare() {
  [[ $# == 2 ]] || die "Usage: bootstrap.sh prepare DOMAIN ACME_EMAIL"
  local domain="$1" email="$2"
  [[ "$domain" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]{0,251}[a-zA-Z0-9]$ && "$domain" != *..* ]] || die "Invalid domain"
  [[ "$email" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]] || die "Invalid contact email"
  need openssl
  [[ ! -e .env && ! -L .env && ! -e .env.backup && ! -L .env.backup ]] || die "Existing configuration preserved; no secrets regenerated"
  (set -o noclobber
   printf 'PUBLIC_DOMAIN=%s\nACME_EMAIL=%s\nPOSTGRES_DB=globalgov\nPOSTGRES_USER=globalgov_admin\nPOSTGRES_PASSWORD=%s\nAPP_DB_USER=globalgov_app\nAPP_DB_PASSWORD=%s\nBACKUP_DB_USER=globalgov_backup\nBACKUP_DB_PASSWORD=%s\nRESTORE_TEST_DB_USER=globalgov_restore_test\nRESTORE_TEST_DB_PASSWORD=%s\nINGEST_HMAC_KEY=\nMODERATOR_TOKEN=\nSSB_AUTOMATED_ACCESS_APPROVED=false\nPGPOOL_MAX=5\nMAX_REQUEST_BODY_BYTES=4194304\n' "$domain" "$email" "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" > .env
   printf 'GLOBALGOV_BACKUP_KEY_HEX=%s\nBACKUP_DIR=/var/lib/globalgov/backups\nBACKUP_RETENTION_DAYS=14\nBACKUP_REQUIRE_REMOTE=true\nBACKUP_REMOTE_TARGET=\n' "$(openssl rand -hex 32)" > .env.backup
  )
  printf '%s\n' "Private configuration created. Save recovery key separately. No service started."
}
rehearse() {
  [[ $# == 2 ]] || die "Usage: bootstrap.sh rehearse PRIMARY_SQL UK_SQL"
  need docker; need realpath; need sha256sum; need stat
  docker compose version >/dev/null || die "Docker Compose plugin required"
  private_file .env; private_file .env.backup
  [[ "$(id -u)" == 1000 ]] || die "Use the dedicated remote UID 1000 account; no ownership changes to originals"
  local primary uk db work key state
  private_file "$1"; private_file "$2"
  primary="$(realpath -- "$1")"; uk="$(realpath -- "$2")"
  private_file "$primary"; private_file "$uk"
  [[ "$primary" != "$uk" ]] || die "Two distinct snapshots required"
  db="$(read_setting POSTGRES_DB .env)"
  [[ "$db" =~ ^[a-z][a-z0-9_]*$ ]] || die "Invalid database name"
  key="$(read_setting GLOBALGOV_BACKUP_KEY_HEX .env.backup)"
  [[ "$key" =~ ^[0-9a-fA-F]{64}$ ]] || die "Invalid backup key"
  export GLOBALGOV_BACKUP_KEY_HEX="$key"; unset key
  # A new isolated project for each rehearsal; never stop existing workloads.
  state="$HOME/.local/state/globalgov"
  mkdir -p -m 700 "$state"
  [[ ! -L "$state" && "$(stat -c '%a' "$state")" == 700 ]] || die "Private state directory required"
  state="$(realpath -- "$state")"
  [[ "$state/" != "$PWD/"* ]] || die "Rehearsal data must be outside the repository/build context"
  work="$(mktemp -d "$state/rehearsal.XXXXXXXX")"
  export COMPOSE_PROJECT_NAME="globalgov-rehearsal-$(basename "$work" | tr -cd 'a-zA-Z0-9' | tr '[:upper:]' '[:lower:]')"
  install -m 600 "$primary" "$work/primary.sql"
  install -m 600 "$uk" "$work/uk.sql"
  (cd "$work"; sha256sum primary.sql uk.sql > SHA256SUMS)
  printf '%s\n' "$COMPOSE_PROJECT_NAME" > "$work/compose-project"
  printf 'Private rehearsal evidence directory: %s\n' "$work"
  docker compose config --quiet
  docker compose --profile tools build migrate app
  docker compose up -d --wait postgres
  docker compose --profile tools run --rm --no-deps migrate
  local mount="$work:/migration"
  tool() { docker compose --profile tools run --rm --no-deps -v "$mount" -e GLOBALGOV_BACKUP_KEY_HEX migrate "$@"; }
  tool node d1-export-backup.mjs encrypt /migration/primary.sql /migration/primary.enc > "$work/primary-encrypt.json"
  tool node d1-export-backup.mjs encrypt-uk /migration/uk.sql /migration/uk.enc > "$work/uk-encrypt.json"
  tool node postgres-import.mjs plan /migration/primary.enc > "$work/primary-plan.json"
  tool node postgres-import.mjs plan-uk /migration/uk.enc > "$work/uk-plan.json"
  for profile in primary uk; do
    local action=apply
    [[ "$profile" == primary ]] || action=apply-uk
    docker compose --profile tools run --rm --no-deps -v "$mount:ro" -e GLOBALGOV_BACKUP_KEY_HEX -e GLOBALGOV_IMPORT_ALLOW_WRITE=true -e "GLOBALGOV_IMPORT_CONFIRM_DATABASE=$db" migrate node postgres-import.mjs "$action" "/migration/$profile.enc" > "$work/$profile-apply.json"
  done
  unset GLOBALGOV_BACKUP_KEY_HEX
  docker compose up -d --wait app
  docker compose exec -T app node -e 'fetch("http://127.0.0.1:8080/internal/ready").then(r=>{if(!r.ok)throw Error("not ready");console.log("Private app ready")}).catch(()=>process.exitCode=1)'
  printf '%s\n' "Rehearsal initialized. No public ingress or scheduler started. Original snapshots preserved. Off-host backup and operational release gates remain separate."
}
case "${1:-}" in
  prepare) shift; prepare "$@" ;;
  rehearse) shift; rehearse "$@" ;;
  *) die "Usage: bootstrap.sh prepare DOMAIN ACME_EMAIL | rehearse PRIMARY_SQL UK_SQL" ;;
esac
