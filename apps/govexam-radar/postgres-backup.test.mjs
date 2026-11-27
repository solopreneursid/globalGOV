import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPostgresBackup } from "./postgres-backup.mjs";
import { openBackupBytes, safeRemoteTarget, sealBackupBytes } from "./postgres-backup.mjs";

test("PostgreSQL backup envelope authenticates encrypted payloads", () => {
  const key = randomBytes(32);
  const plaintext = Buffer.from("synthetic PostgreSQL custom archive bytes");
  try {
    const envelope = sealBackupBytes(plaintext, key);
    assert.notDeepEqual(envelope, plaintext);
    assert.deepEqual(openBackupBytes(envelope, key), plaintext);
    const tampered = Buffer.from(envelope);
    tampered[tampered.length - 1] ^= 1;
    assert.throws(() => openBackupBytes(tampered, key));
    assert.throws(() => openBackupBytes(envelope, randomBytes(32)));
  } finally {
    key.fill(0);
  }
});

test("off-host backups accept only owner-hosted absolute SSH directories", () => {
  assert.equal(safeRemoteTarget("backupuser@backup.example:/srv/globalgov/backups/"),
    "backupuser@backup.example:/srv/globalgov/backups/");
  for (const target of [
    "backupuser@backup.example:relative/path",
    "backupuser@backup.example:/srv/../etc/",
    "backupuser@backup.example:/srv//backups/",
    "https://backup.example/upload"
  ]) assert.throws(() => safeRemoteTarget(target), /remote_target_invalid/);
});

test("production backup refuses local-only mode when off-host backup is required", async () => {
  const directory = await mkdtemp(join(tmpdir(), "globalgov-backup-"));
  const key = randomBytes(32);
  const calls = [];
  const pool = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.startsWith("INSERT INTO backup_runs")) return { rowCount: 1, rows: [{ id: values[0] }] };
      return { rowCount: 1, rows: [] };
    }
  };
  try {
    await assert.rejects(createPostgresBackup({
      pool,
      key,
      backupDir: directory,
      runId: "test:remote-required",
      env: { BACKUP_REQUIRE_REMOTE: "true", BACKUP_REMOTE_TARGET: "" },
      now: () => Date.parse("2026-11-27T02:15:00Z")
    }), /off_host_backup_destination_required/);
    assert.ok(calls.some(call => call.sql.includes("state='error'")));
  } finally {
    key.fill(0);
    await rm(directory, { recursive: true, force: true });
  }
});
