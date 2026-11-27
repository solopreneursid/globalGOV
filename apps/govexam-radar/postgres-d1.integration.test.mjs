import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { PostgresD1Database } from "./postgres-d1.mjs";

test("PostgreSQL adapter preserves D1 query, conflict and transaction semantics", async () => {
  const pool = new Pool({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || "globalgov",
    user: process.env.PGUSER || "globalgov",
    password: process.env.PGPASSWORD || "globalgov-ci-only",
    max: 2,
    connectionTimeoutMillis: 5000
  });
  const db = new PostgresD1Database(pool);
  const memberId = "pg-adapter-integration-member";
  const postId = "pg-adapter-integration-post";
  try {
    await db.prepare("DELETE FROM reports WHERE reporter_id=?").bind(memberId).run();
    await db.prepare("DELETE FROM votes WHERE post_id=?").bind(postId).run();
    await db.prepare("DELETE FROM posts WHERE id=?").bind(postId).run();
    await db.prepare("DELETE FROM members WHERE id=?").bind(memberId).run();

    const member = await db.prepare(
      "INSERT INTO members(id,handle,token_hash,created_at) VALUES(?,?,?,?)"
    ).bind(memberId, "PgAdapterUser", "a".repeat(64), 1).run();
    assert.equal(member.meta.changes, 1);

    const caseInsensitive = await db.prepare(
      "SELECT id FROM members WHERE handle=? COLLATE NOCASE"
    ).bind("pgadapteruser").first();
    assert.equal(caseInsensitive.id, memberId);

    await db.prepare(
      "INSERT INTO posts(id,exam_id,member_id,tag,content,created_at) VALUES(?,?,?,?,?,?)"
    ).bind(postId, "integration-room", memberId, "#Syllabus & Strategy", "Adapter integration record", 2).run();

    const firstVote = await db.prepare(
      "INSERT OR IGNORE INTO votes(post_id,member_id,created_at) VALUES(?,?,?)"
    ).bind(postId, memberId, 3).run();
    const duplicateVote = await db.prepare(
      "INSERT OR IGNORE INTO votes(post_id,member_id,created_at) VALUES(?,?,?)"
    ).bind(postId, memberId, 4).run();
    assert.equal(firstVote.meta.changes, 1);
    assert.equal(duplicateVote.meta.changes, 0);

    const all = await db.prepare("SELECT id FROM posts WHERE id=?").bind(postId).all();
    assert.equal(all.results.length, 1);
    assert.equal(all.results[0].id, postId);

    await assert.rejects(() => db.batch([
      db.prepare("INSERT INTO members(id,handle,token_hash,created_at) VALUES(?,?,?,?)")
        .bind("pg-adapter-rollback-member", "RollbackUser", "b".repeat(64), 5),
      db.prepare("INSERT INTO table_that_does_not_exist(id) VALUES(?)").bind("failure")
    ]));
    const rolledBack = await db.prepare("SELECT id FROM members WHERE id=?")
      .bind("pg-adapter-rollback-member").first();
    assert.equal(rolledBack, null);

    const reports = await db.prepare(
      "INSERT OR IGNORE INTO reports(id,target_type,target_id,reporter_id,reason,created_at) VALUES(?,?,?,?,?,?)"
    ).bind("pg-adapter-report-1", "post", postId, memberId, "spam", 6).run();
    assert.equal(reports.meta.changes, 1);
  } finally {
    await db.prepare("DELETE FROM reports WHERE reporter_id=?").bind(memberId).run().catch(() => {});
    await db.prepare("DELETE FROM votes WHERE post_id=?").bind(postId).run().catch(() => {});
    await db.prepare("DELETE FROM posts WHERE id=?").bind(postId).run().catch(() => {});
    await db.prepare("DELETE FROM members WHERE id=?").bind(memberId).run().catch(() => {});
    await db.close();
  }
});
