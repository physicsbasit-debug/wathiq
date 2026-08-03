import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const kernelUrl = new URL("../src/assessment-engine/", import.meta.url);
const files = (await readdir(kernelUrl)).filter((name) => name.endsWith(".ts"));
const source = (await Promise.all(files.map(async (name) => readFile(new URL(name, kernelUrl), "utf8")))).join("\n");

test("تبقى نواة Phase 2-D مستقلة عن المحرك السابق والواجهة وSupabase", () => {
  assert.doesNotMatch(source, /from\s+["'][^"']*question-generation/);
  assert.doesNotMatch(source, /from\s+["'][^"']*assessment-generation-v2/);
  assert.doesNotMatch(source, /from\s+["'][^"']*app/);
  assert.doesNotMatch(source, /createClient\(|supabase\.from\(|localStorage|sessionStorage|globalThis\.fetch/);
});

test("لا تحتوي النواة استدعاءً للمحرك السابق أو مسار عودة إنتاجي إليه", () => {
  assert.doesNotMatch(source, /generateWholeExam|scopedGenerationRequest|legacy_items|whole_exam_v2/);
});
