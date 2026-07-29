import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("يضيف SQL جدول هيكل المصدر مع RLS", async () => {
  const sql = await read("supabase/phase_0_h1_source_structure.sql");
  assert.match(sql, /create table if not exists public\.source_structure_nodes/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /review_status/);
  assert.match(sql, /parent_id/);
});

test("يبقى تخزين الهيكل القديم متوافقًا دون أن يقود واجهة H3", async () => {
  const [app, store] = await Promise.all([read("src/app.ts"), read("src/central-source-store.ts")]);
  assert.doesNotMatch(app, /approve-source-structure|approve-toc-draft|منشئ الفهرس المنظم/);
  assert.match(store, /replaceSourceStructure/);
  assert.match(store, /listSourceChunks/);
});

test("لا يتغير pages.yml في Phase 0-H2", async () => {
  const pages = await read(".github/workflows/pages.yml");
  assert.doesNotMatch(pages, /SOURCE_STRUCTURE/);
});
