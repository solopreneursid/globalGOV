import test from "node:test";
import assert from "node:assert/strict";
import { applyCoreMigration } from "./self-hosted-migrate.mjs";

test("applies the core migration and verifies its marker", async () => {
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
