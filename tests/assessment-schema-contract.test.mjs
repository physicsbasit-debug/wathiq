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
  assert.equal(v4Fallbacks.length, 2);
  assert.doesNotMatch(schema, /coalesce\(\(p_blueprint ->> 'blueprintVersion'\)::integer, 1\)/);

  assert.match(migration, /drop constraint if exists assessment_generation_runs_blueprint_version_check/i);
  assert.match(migration, /alter column blueprint_version set default 4/i);
  assert.match(migration, /check \(blueprint_version in \(1, 4\)\)/i);
  assert.doesNotMatch(migration, /update\s+public\.assessment_generation_runs\s+set\s+blueprint_version\s*=\s*4/i);
});

test("سياسة الضغط تمنح محاولات نقل متدرجة وتسمح بإعادة يدوية بعد استنفاد الدورة", async () => {
  const pressureMigrationPath = new URL("../supabase/migrations/20260812_assessment_generation_pressure_control.sql", import.meta.url);
  const schema = await readFile(schemaPath, "utf8");
  const migration = await readFile(pressureMigrationPath, "utf8");

  for (const sql of [schema, migration]) {
    assert.match(sql, /transport_retry_count\s+between\s+0\s+and\s+2/i);
    assert.match(sql, /p_retry_class\s+in\s*\('transport_once',\s*'transport_backoff'\).*transport_retry_count\s*<\s*2/is);
    assert.match(sql, /create or replace function public\.retry_assessment_generation_item[\s\S]*attempt_count\s*=\s*0[\s\S]*transport_retry_count\s*=\s*0[\s\S]*content_retry_count\s*=\s*0/i);
    assert.match(sql, /create or replace function public\.resume_assessment_generation_run[\s\S]*status\s*=\s*'retry_pending'[\s\S]*attempt_count\s*=\s*0/i);
  }
});
