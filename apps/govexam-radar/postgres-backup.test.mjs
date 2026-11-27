import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
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
