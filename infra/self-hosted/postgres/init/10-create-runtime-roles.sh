#!/usr/bin/env bash
set -Eeuo pipefail

: "${POSTGRES_USER:?POSTGRES_USER must name the database owner}"
: "${POSTGRES_DB:?POSTGRES_DB must be set}"
: "${APP_DB_USER:?APP_DB_USER must be set}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD must be set}"
: "${BACKUP_DB_USER:?BACKUP_DB_USER must be set}"
: "${BACKUP_DB_PASSWORD:?BACKUP_DB_PASSWORD must be set}"

psql --no-psqlrc --set=ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=admin_user="$POSTGRES_USER" \
  --set=db_name="$POSTGRES_DB" \
  --set=app_user="$APP_DB_USER" \
  --set=app_password="$APP_DB_PASSWORD" \
  --set=backup_user="$BACKUP_DB_USER" \
  --set=backup_password="$BACKUP_DB_PASSWORD" <<'SQL'
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password';
CREATE ROLE :"backup_user" LOGIN PASSWORD :'backup_password';

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db_name" TO :"app_user", :"backup_user";
GRANT USAGE ON SCHEMA public TO :"app_user", :"backup_user";
GRANT pg_read_all_data TO :"backup_user";

ALTER DEFAULT PRIVILEGES FOR ROLE :"admin_user" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"admin_user" IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO :"app_user";
SQL
