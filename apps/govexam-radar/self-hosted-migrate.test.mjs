import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyCoreMigration, applyMigrations, loadMigrations } from "./self-hosted-migrate.mjs";

test("applies the legacy core migration and verifies its marker", async () => {
  const calls = [];
  const pool = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.startsWith("SELECT version")) return { rows: [{ version: "001_core" }] };
      return { rows: [] };
    }
  };
  const result = await applyCoreMigration(pool, "BEGIN; SELECT 1; COMMIT;");
  assert.deepEqual(result, { version: "001_core", status: "applied" });
  assert.equal(calls.length, 2);
});

test("loads migrations in numeric order and rejects a missing marker", async () => {
  const directory = await mkdtemp(join(tmpdir(), "globalgov-migrations-"));
  try {
    await writeFile(join(directory, "002_first_party_operations.sql"),
      "INSERT INTO schema_migrations(version) VALUES ('002_first_party_operations');");
    await writeFile(join(directory, "001_core.sql"),
      "INSERT INTO schema_migrations(version) VALUES ('001_core');");
    await writeFile(join(directory, "notes.txt"), "not a migration");
    const migrations = await loadMigrations(directory);
    assert.deepEqual(migrations.map(x => x.version), ["001_core", "002_first_party_operations"]);
    await writeFile(join(directory, "003_broken.sql"), "SELECT 1;");
    await assert.rejects(loadMigrations(directory), /marker_missing/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("applies missing migrations and skips previously applied versions", async () => {
  const applied = new Set();
  const calls = [];
  const pool = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.startsWith("SELECT version")) {
        return { rows: applied.has(values[0]) ? [{ version: values[0] }] : [] };
      }
      for (const match of sql.matchAll(/VALUES\\s*\\('([^']+)'\\)/g)) applied.add(match[1]);
      return { rows: [] };
    }
  };
  const migrations = [
    { version: "001_core", sql: "INSERT INTO schema_migrations(version) VALUES ('001_core');" },
    { version: "002_first_party_operations", sql: "INSERT INTO schema_migrations(version) VALUES ('002_first_party_operations');" }
  ];
  assert.deepEqual(await applyMigrations(pool, migrations), [
    { version: "001_core", status: "applied" },
    { version: "002_first_party_operations", status: "applied" }
  ]);
  assert.deepEqual(await applyMigrations(pool, migrations), [
    { version: "001_core", status: "already_applied" },
    { version: "002_first_party_operations", status: "already_applied" }
  ]);
});
