import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { Pool } from "pg";
import { createProgressStore } from "../server/progress-store.js";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("Set TEST_DATABASE_URL to a PostgreSQL test database.");

const schemaName = "game_test_" + randomBytes(12).toString("hex");
const admin = new Pool({ connectionString, connectionTimeoutMillis: 8000 });
const pool = new Pool({ connectionString, connectionTimeoutMillis: 8000, options: `-c search_path=${schemaName}` });
const store = createProgressStore(pool);
const newHash = () => randomBytes(32).toString("hex");

before(async () => {
  await admin.query(`CREATE SCHEMA ${schemaName}`);
  const migration = await readFile(new URL("../database/schema.sql", import.meta.url), "utf8");
  await pool.query(migration);
  await pool.query(migration);
});

after(async () => {
  await pool.end();
  try {
    await admin.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
  } finally {
    await admin.end();
  }
});

test("only one writer creates a save, and only one advances each revision", async () => {
  const hash = newHash();
  const progress = { spiritShards: 16, unlockedCharacters: ["blaze"], scores: [] };
  assert.equal(await store.read(hash), null);
  assert.equal(await store.write(hash, 1, progress), null);

  const creates = await Promise.all(Array.from({ length: 8 }, (_, i) =>
    store.write(hash, 0, { ...progress, spiritShards: 100 + i })));
  const created = creates.filter(Boolean);
  assert.equal(created.length, 1);
  assert.equal(created[0].revision, 1);
  assert.deepEqual(await store.read(hash), created[0]);

  const updates = await Promise.all(Array.from({ length: 8 }, (_, i) =>
    store.write(hash, 1, { ...progress, spiritShards: 400 + i })));
  const updated = updates.filter(Boolean);
  assert.equal(updated.length, 1);
  assert.equal(updated[0].revision, 2);
  assert.deepEqual(await store.read(hash), updated[0]);
  assert.equal(await store.write(hash, 1, progress), null);

  // A fresh connection sees the committed winner, as a subsequent function invocation must.
  const reader = new Pool({ connectionString, options: `-c search_path=${schemaName}` });
  try {
    assert.deepEqual(await createProgressStore(reader).read(hash), updated[0]);
  } finally {
    await reader.end();
  }
});

test("the migration enables row-level security on player saves", async () => {
  const { rows } = await pool.query("SELECT relrowsecurity FROM pg_class WHERE oid = 'game_progress'::regclass");
  assert.equal(rows[0].relrowsecurity, true);
});

test("separate save keys have independent revision histories", async () => {
  const first = newHash();
  const second = newHash();
  await store.write(first, 0, { spiritShards: 250 });
  await store.write(second, 0, { spiritShards: 50 });
  await store.write(first, 1, { spiritShards: 450 });
  assert.deepEqual(await store.read(second), { revision: 1, progress: { spiritShards: 50 } });
});

test("database constraints reject malformed digests and unrepresentable revision numbers", async () => {
  await assert.rejects(store.write("invalid digest", 0, {}), { code: "23514" });
  const hash = newHash();
  const max = Number.MAX_SAFE_INTEGER;
  await pool.query("INSERT INTO game_progress VALUES ($1, $2, $3)", [hash, max, {}]);
  assert.deepEqual(await store.read(hash), { revision: max, progress: {} });
  assert.equal(await store.write(hash, max, { spiritShards: 1 }), null);
});
