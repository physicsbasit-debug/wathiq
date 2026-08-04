import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schemaSql = await readFile(
  new URL("../supabase/phase_2_d2_assessment_generation_jobs.sql", import.meta.url),
  "utf8",
);
const correctionSql = await readFile(
  new URL("../supabase/phase_2_d2_sql_contract_correction.sql", import.meta.url),
  "utf8",
);

const qualifiedDistinctCount = /select\s+count\(distinct\s+item\.plan_item_id\)\s+into\s+v_seen_count\s+from\s+public\.assessment_generation_items\s+as\s+item\s+where\s+item\.run_id\s*=\s*v_run_id;/is;
const ambiguousDistinctCount = /select\s+count\(distinct\s+plan_item_id\)\s+into\s+v_seen_count\s+from\s+public\.assessment_generation_items\s+where\s+run_id\s*=\s*v_run_id;/is;

test("D2 SQL qualifies run/item columns that collide with RETURNS TABLE output names", () => {
  assert.match(schemaSql, qualifiedDistinctCount);
  assert.doesNotMatch(schemaSql, ambiguousDistinctCount);
});

test("D2 standalone SQL correction replaces the same function without destructive DDL", () => {
  assert.match(
    correctionSql,
    /create or replace function public\.enqueue_assessment_generation_run\(/i,
  );
  assert.match(correctionSql, qualifiedDistinctCount);
  assert.doesNotMatch(correctionSql, /drop\s+table|truncate\s+table|delete\s+from/i);
});
