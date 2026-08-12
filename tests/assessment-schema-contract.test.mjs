import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schemaPath = new URL("../supabase/schema-current.sql", import.meta.url);
const migrationPath = new URL("../supabase/migrations/20260811_assessment_blueprint_v4_constraint.sql", import.meta.url);

test("مخطط Supabase الدائم يقبل Blueprint v4 ويحافظ على سجلات v1 التاريخية", async () => {
  const schema = await readFile(schemaPath, "utf8");
  const migration = await readFile(migrationPath, "utf8");

  assert.match(schema, /blueprint_version\s+integer\s+not null\s+default 4\s+check \(blueprint_version in \(1, 4\)\)/i);
  assert.doesNotMatch(schema, /blueprint_version\s+integer\s+not null\s+default 1\s+check \(blueprint_version = 1\)/i);

  const v4Fallbacks = schema.match(/coalesce\(\(p_blueprint ->> 'blueprintVersion'\)::integer, 4\)/g) ?? [];
  assert.equal(v4Fallbacks.length, 1);
  assert.doesNotMatch(schema, /coalesce\(\(p_blueprint ->> 'blueprintVersion'\)::integer, 1\)/);

  assert.match(migration, /drop constraint if exists assessment_generation_runs_blueprint_version_check/i);
  assert.match(migration, /alter column blueprint_version set default 4/i);
  assert.match(migration, /check \(blueprint_version in \(1, 4\)\)/i);
  assert.doesNotMatch(migration, /update\s+public\.assessment_generation_runs\s+set\s+blueprint_version\s*=\s*4/i);
});

test("سياسة الضغط تفصل تأجيل خدمة Gemini عن محاولات محتوى السؤال", async () => {
  const quotaMigrationPath = new URL("../supabase/migrations/20260812_assessment_generation_quota_aware_retry.sql", import.meta.url);
  const schema = await readFile(schemaPath, "utf8");
  const migration = await readFile(quotaMigrationPath, "utf8");

  for (const sql of [schema, migration]) {
    assert.match(sql, /transport_retry_count\s+between\s+0\s+and\s+100/i);
    assert.match(sql, /retry_after_at\s+timestamptz/i);
    assert.match(sql, /author_checkpoint\s+jsonb/i);
    assert.match(sql, /transport_backoff[\s\S]*greatest\(attempt_count - 1, 0\)/i);
    assert.match(sql, /checkpoint_assessment_generation_author/i);
    assert.match(sql, /create or replace function public\.retry_assessment_generation_item[\s\S]*retry_after_at\s*=\s*null[\s\S]*author_checkpoint\s*=\s*null/i);
  }
});


test("v0.3.11 يزيل overload القديم ويثبت RPC فشل واحدًا فقط", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260812_assessment_generation_provider_protocol_repair.sql", import.meta.url), "utf8");
  assert.match(migration, /drop function if exists public\.fail_assessment_generation_item\(uuid, text, uuid, text, text, text\);/i);
  assert.match(migration, /drop function if exists public\.fail_assessment_generation_item\(uuid, text, uuid, text, text, text, integer\);/i);
  assert.match(migration, /create function public\.fail_assessment_generation_item\([\s\S]*p_retry_after_seconds integer/i);
  assert.match(migration, /notify pgrst, 'reload schema'/i);
  assert.match(migration, /canonical_fail_rpc_count/i);
});


test("v0.3.12 يثبت عقد تشغيل واحدًا لا يسمح لضغط Gemini بالتحول إلى failed", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260812_assessment_generation_runtime_contract_repair.sql", import.meta.url), "utf8");
  const schema = await readFile(schemaPath, "utf8");
  for (const sql of [migration, schema]) {
    assert.match(sql, /create or replace function public\.defer_assessment_generation_item_v1/);
    assert.match(sql, /set status = 'retry_pending'[\s\S]*attempt_count = greatest\(attempt_count - 1, 0\)/i);
    assert.match(sql, /create or replace function public\.fail_assessment_generation_content_v1/);
    assert.match(sql, /create or replace function public\.recover_stale_assessment_generation_items_v1/);
    assert.match(sql, /create or replace function public\.assessment_generation_runtime_contract_v1/);
  }
  assert.match(migration, /item\.error_code in \('MODEL_RATE_LIMITED','MODEL_QUOTA_EXHAUSTED','MODEL_UNAVAILABLE','MODEL_TIMEOUT'\)/);
});

test("schema-current يعيد تعريف recover_stale ولا يعتمد على دالة مفقودة من نسخة أقدم", async () => {
  const schema = await readFile(schemaPath, "utf8");
  assert.match(schema, /create or replace function public\.recover_stale_assessment_generation_items_v1/);
  assert.match(schema, /create or replace function public\.recover_stale_assessment_generation_items\(/);
});
