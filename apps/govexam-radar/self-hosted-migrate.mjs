import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { createPostgresPoolFromEnv } from "./postgres-d1.mjs";
import { pathToFileURL } from "node:url";

async function resolveSchemaPath() {
  if (process.env.GLOBALGOV_SCHEMA_PATH) return process.env.GLOBALGOV_SCHEMA_PATH;
  const candidates = [
    new URL("./migrations/001_core.sql", import.meta.url),
    new URL("../../infra/self-hosted/postgres/001_core.sql", import.meta.url)
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.R_OK);
      return candidate;
    } catch {
      // Try the next known location.
    }
  }
  throw new Error("postgres_schema_file_not_found");
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

async function main() {
  const schemaPath = await resolveSchemaPath();
  const schemaSql = await readFile(schemaPath, "utf8");
  const pool = await createPostgresPoolFromEnv();
  try {
    const result = await applyCoreMigration(pool, schemaSql);
    console.log(JSON.stringify({ ...result, schemaPath: String(schemaPath) }));
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
