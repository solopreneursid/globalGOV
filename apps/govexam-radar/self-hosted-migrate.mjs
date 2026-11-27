import { readFile, access, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { createPostgresPoolFromEnv } from "./postgres-d1.mjs";
import { pathToFileURL, fileURLToPath } from "node:url";

const MIGRATION_VERSION = /^([0-9]{3}_[a-z0-9_]+)\.sql$/;

export async function resolveMigrationDirectory() {
  if (process.env.GLOBALGOV_SCHEMA_DIR) return process.env.GLOBALGOV_SCHEMA_DIR;
  const candidates = [
    new URL("./migrations/", import.meta.url),
    new URL("../../infra/self-hosted/postgres/", import.meta.url)
  ];
  for (const candidate of candidates) {
    try {
      await access(new URL("001_core.sql", candidate), constants.R_OK);
      return fileURLToPath(candidate);
    } catch {
      // Try the next known repository/container location.
    }
  }
  throw new Error("postgres_schema_directory_not_found");
}

export async function loadMigrations(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries
    .filter(entry => entry.isFile() && MIGRATION_VERSION.test(entry.name))
    .map(entry => entry.name)
    .sort();
  if (!files.length || files[0] !== "001_core.sql") throw new Error("postgres_core_migration_missing");
  const migrations = [];
  for (const file of files) {
    const version = MIGRATION_VERSION.exec(file)[1];
    const sql = await readFile(join(directory, file), "utf8");
    if (!sql.trim() || !new RegExp("VALUES\\s*\\('" + version + "'\\)", "i").test(sql)) {
      throw new Error("postgres_migration_marker_missing:" + version);
    }
    migrations.push({ version, file, sql });
  }
  return migrations;
}

async function migrationExists(pool, version) {
  try {
    const result = await pool.query(
      "SELECT version FROM schema_migrations WHERE version=$1",
      [version]
    );
    return result.rows.length === 1;
  } catch (error) {
    if (error?.code === "42P01") return false;
    throw error;
  }
}

export async function applyMigrations(pool, migrations) {
  if (!pool || typeof pool.query !== "function" || !Array.isArray(migrations) || !migrations.length) {
    throw new Error("migration_inputs_invalid");
  }
  const results = [];
  for (const migration of migrations) {
    if (!/^[0-9]{3}_[a-z0-9_]+$/.test(migration.version) ||
        typeof migration.sql !== "string" || !migration.sql.trim()) {
      throw new Error("migration_entry_invalid");
    }
    if (await migrationExists(pool, migration.version)) {
      results.push({ version: migration.version, status: "already_applied" });
      continue;
    }
    await pool.query(migration.sql);
    if (!await migrationExists(pool, migration.version)) {
      throw new Error("migration_verification_failed:" + migration.version);
    }
    results.push({ version: migration.version, status: "applied" });
  }
  return results;
}

export async function applyCoreMigration(pool, schemaSql) {
  if (!pool || typeof pool.query !== "function" || typeof schemaSql !== "string" || !schemaSql.trim()) {
    throw new Error("migration_inputs_invalid");
  }
  await pool.query(schemaSql);
  const result = await pool.query("SELECT version FROM schema_migrations WHERE version=$1", ["001_core"]);
  if (result.rows.length !== 1) throw new Error("migration_verification_failed");
  return { version: "001_core", status: "applied" };
}

export async function applyRuntimeRoleGrants(pool, env = process.env) {
  const adminUser = env.POSTGRES_USER || env.PGUSER || "";
  const appUser = env.APP_DB_USER || "";
  const backupUser = env.BACKUP_DB_USER || "";
  if (!adminUser || !appUser || !backupUser) return { status: "skipped", reason: "runtime_roles_not_configured" };
  if (!env.PGDATABASE) throw new Error("postgres_runtime_database_name_required");
  const valid = /^[A-Za-z_][A-Za-z0-9_]*$/;
  if (![adminUser, appUser, backupUser].every(name => valid.test(name)) ||
      new Set([adminUser, appUser, backupUser]).size !== 3) {
    throw new Error("postgres_runtime_role_name_invalid");
  }
  const quote = name => '"' + name + '"';
  await pool.query("GRANT CONNECT ON DATABASE " + quote(env.PGDATABASE || "") +
    " TO " + quote(appUser) + "," + quote(backupUser));
  await pool.query("GRANT USAGE ON SCHEMA public TO " + quote(appUser) + "," + quote(backupUser));
  await pool.query("GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO " + quote(appUser));
  await pool.query("GRANT USAGE,SELECT,UPDATE ON ALL SEQUENCES IN SCHEMA public TO " + quote(appUser));
  await pool.query("ALTER DEFAULT PRIVILEGES FOR ROLE " + quote(adminUser) +
    " IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO " + quote(appUser));
  await pool.query("ALTER DEFAULT PRIVILEGES FOR ROLE " + quote(adminUser) +
    " IN SCHEMA public GRANT USAGE,SELECT,UPDATE ON SEQUENCES TO " + quote(appUser));
  await pool.query("GRANT pg_read_all_data TO " + quote(backupUser));
  await pool.query("GRANT SELECT,INSERT,UPDATE ON TABLE backup_runs TO " + quote(backupUser));
  return { status: "applied", appRole: appUser, backupRole: backupUser };
}

async function main() {
  const directory = await resolveMigrationDirectory();
  const migrations = await loadMigrations(directory);
  const pool = await createPostgresPoolFromEnv();
  try {
    const results = await applyMigrations(pool, migrations);
    const roleGrants = await applyRuntimeRoleGrants(pool, process.env);
    console.log(JSON.stringify({ status: "ok", directory: String(directory), migrations: results, roleGrants }));
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(JSON.stringify({ event: "migration_failed", error: String(error?.message || error) }));
    process.exitCode = 1;
  });
}
