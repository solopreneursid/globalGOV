import test from "node:test";
import assert from "node:assert/strict";
import { PostgresD1Database, translateD1Sql } from "./postgres-d1.mjs";

test("translates positional placeholders without touching quoted strings or comments", () => {
  const result = translateD1Sql("SELECT '?' AS literal, value FROM records WHERE id=? -- ?\nAND name=?");
  assert.equal(result.sql, "SELECT '?' AS literal, value FROM records WHERE id=$1 -- ?\nAND name=$2");
  assert.equal(result.parameterCount, 2);
});

test("translates D1 case-insensitive handle lookup", () => {
  const result = translateD1Sql("SELECT id FROM members WHERE handle=? COLLATE NOCASE");
  assert.equal(result.sql, "SELECT id FROM members WHERE LOWER(handle)=LOWER($1)");
  assert.equal(result.parameterCount, 1);
});

test("translates INSERT OR IGNORE into PostgreSQL conflict handling", () => {
  const result = translateD1Sql("INSERT OR IGNORE INTO votes(post_id,member_id) VALUES(?,?)");
  assert.equal(result.sql, "INSERT INTO votes(post_id,member_id) VALUES($1,$2) ON CONFLICT DO NOTHING");
  assert.equal(result.parameterCount, 2);
});

test("preserves an existing explicit ON CONFLICT clause", () => {
  const result = translateD1Sql("INSERT INTO records(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value");
  assert.match(result.sql, /ON CONFLICT\(id\) DO UPDATE/);
  assert.equal(result.parameterCount, 2);
});

test("supports dollar-quoted function bodies and nested placeholder characters", () => {
  const result = translateD1Sql("SELECT $$? literal$$, value FROM records WHERE id=?");
  assert.equal(result.sql, "SELECT $$? literal$$, value FROM records WHERE id=$1");
  assert.equal(result.parameterCount, 1);
});

test("D1 first/all/run result shapes map to PostgreSQL", async () => {
  const calls = [];
  const pool = {
    async query(sql, values) {
      calls.push({ sql, values });
      return { rows: [{ id: "x", count: "4" }], rowCount: 1 };
    },
    async connect() { throw new Error("not_used"); },
    async end() {}
  };
  const db = new PostgresD1Database(pool);
  assert.deepEqual(await db.prepare("SELECT id FROM t WHERE id=?").bind("x").first(), { id: "x", count: "4" });
  assert.equal(await db.prepare("SELECT count(*) AS count FROM t").first("count").then(Number), 4);
  const all = await db.prepare("SELECT id FROM t").all();
  assert.equal(all.success, true);
  assert.equal(all.results.length, 1);
  const run = await db.prepare("UPDATE t SET id=?").bind("y").run();
  assert.equal(run.meta.changes, 1);
  assert.equal(calls[0].values[0], "x");
  await db.close();
});

test("batch executes atomically and rolls back on failure", async () => {
  const calls = [];
  let fail = false;
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (fail && sql === "BAD SQL") throw new Error("statement_failed");
      return { rows: [], rowCount: 1 };
    },
    release() { calls.push({ sql: "RELEASE" }); }
  };
  const pool = {
    async query(sql, values) { calls.push({ sql, values }); return { rows: [], rowCount: 1 }; },
    async connect() { return client; },
    async end() {}
  };
  const db = new PostgresD1Database(pool);
  const success = await db.batch([
    db.prepare("UPDATE a SET x=?").bind(1),
    db.prepare("UPDATE b SET x=?").bind(2)
  ]);
  assert.equal(success.length, 2);
  assert.deepEqual(calls.map(x => x.sql), ["BEGIN", "UPDATE a SET x=$1", "UPDATE b SET x=$1", "COMMIT", "RELEASE"]);

  calls.length = 0;
  fail = true;
  await assert.rejects(() => db.batch([db.prepare("BAD SQL")]), /statement_failed/);
  assert.deepEqual(calls.map(x => x.sql), ["BEGIN", "BAD SQL", "ROLLBACK", "RELEASE"]);
});
