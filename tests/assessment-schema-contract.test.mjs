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
