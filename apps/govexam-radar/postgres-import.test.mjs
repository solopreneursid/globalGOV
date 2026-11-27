import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { importD1Snapshot } from "./postgres-import.mjs";

function fixture() {
  const sourceDb = new DatabaseSync(":memory:");
  sourceDb.exec(`
    CREATE TABLE members (
      id TEXT PRIMARY KEY,
      handle TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_post_at INTEGER NOT NULL DEFAULT 0,
      last_reply_at INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO members VALUES
      ('m-1','alpha','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',100,0,0),
      ('m-2','beta','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',200,10,20);
  `);
  return sourceDb;
}

function mockPool() {
  const tables = new Map([["members", []]]);
  const columns = [
    ["id", "text"], ["handle", "text"], ["token_hash", "character"],
    ["created_at", "bigint"], ["last_post_at", "bigint"], ["last_reply_at", "bigint"]
  ].map(([column_name, data_type], index) => ({ column_name, data_type, ordinal_position: index + 1 }));
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.startsWith("SELECT column_name")) return { rows: columns };
      if (sql.startsWith("SELECT COUNT(*)")) {
        const table = sql.match(/FROM "([^"]+)"/)[1];
        return { rows: [{ count: String(tables.get(table)?.length ?? 0) }] };
      }
      if (sql.startsWith('INSERT INTO "members"')) {
        const match = sql.match(/^INSERT INTO "members" \(([^)]+)\) VALUES /);
        const names = match[1].split(",").map(x => x.replaceAll('"', ""));
        const width = names.length;
        for (let offset = 0; offset < values.length; offset += width) {
          const row = Object.fromEntries(names.map((name, index) => [name, values[offset + index]]));
          tables.get("members").push(row);
        }
        return { rowCount: values.length / width, rows: [] };
      }
      if (sql.startsWith('SELECT "id","handle"')) {
        return { rows: tables.get("members").slice().sort((a, b) => a.id.localeCompare(b.id)) };
      }
      if (sql.startsWith("INSERT INTO data_migration_runs")) return { rowCount: 1, rows: [] };
      return { rowCount: 1, rows: [] };
    },
    release() {}
  };
  return { options: { database: "globalgov" }, calls, tables, async connect() { return client; } };
}

test("D1 import plan validates schema, row counts and checksums without writing", async () => {
  const sourceDb = fixture();
  const pool = mockPool();
  try {
    const result = await importD1Snapshot({ sourceDb, pool, tables: ["members"] });
    assert.equal(result.state, "planned");
    assert.equal(result.totalRows, 2);
    assert.equal(result.targetEmpty, true);
    assert.equal(result.schemaCompatible, true);
    assert.equal(result.writesPerformed, false);
    assert.equal(pool.tables.get("members").length, 0);
  } finally {
    sourceDb.close();
  }
});

test("D1 import requires explicit database confirmation and verifies every imported row", async () => {
  const sourceDb = fixture();
  const pool = mockPool();
  try {
    await assert.rejects(importD1Snapshot({
      sourceDb, pool, mode: "apply", tables: ["members"]
    }), /write_confirmation_required/);
    const result = await importD1Snapshot({
      sourceDb, pool, mode: "apply", tables: ["members"],
      allowWrite: true, confirmDatabase: "globalgov", expectedDatabase: "globalgov"
    });
    assert.equal(result.state, "verified");
    assert.equal(result.writesPerformed, true);
    assert.equal(pool.tables.get("members").length, 2);
    assert.ok(pool.calls.some(call => call.sql === "COMMIT"));
  } finally {
    sourceDb.close();
  }
});

test("D1 import refuses non-empty targets and table allowlist expansion", async () => {
  const sourceDb = fixture();
  const pool = mockPool();
  pool.tables.get("members").push({ id: "existing" });
  try {
    await assert.rejects(importD1Snapshot({
      sourceDb, pool, tables: ["members"]
    }), /target_table_not_empty/);
    await assert.rejects(importD1Snapshot({
      sourceDb, pool, tables: ["members", "arbitrary_table"]
    }), /allowlist_violation/);
  } finally {
    sourceDb.close();
  }
});
