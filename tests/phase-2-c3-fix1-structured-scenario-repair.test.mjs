import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ASSESSMENT_GENERATION_V2_VERSION } from "../dist/assets/assessment-generation-v2.js";

const text = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const edge = await text("supabase/functions/generate-source-questions/index.ts");
const pkg = JSON.parse(await text("package.json"));

test("يحافظ على عقد إصلاح السياق ai-19 داخل الإصدار العلمي الموحد الأحدث", () => {
  assert.match(pkg.version, /^0\.0\.(?:56|57|58|59)$/);
  assert.match(ASSESSMENT_GENERATION_V2_VERSION, /source-grounded-policy-ai-(?:19-structured-scenario-repair|20-unified-scientific-item|21-server-owned-scientific-item)/);
  assert.match(edge, /source-grounded-policy-ai-19-structured-scenario-repair/);
});

test("يستبدل مطابقة كلمات السياق بعقد منظم موثق من متن السؤال", () => {
  assert.doesNotMatch(edge, /SCENARIO_KEYWORDS/);
  assert.match(edge, /interface ModelGeneratedScenarioContract/);
  assert.match(edge, /evidencePhrases/);
  assert.match(edge, /scientificLink/);
  assert.match(edge, /contextIsEssential/);
  assert.match(edge, /validateStructuredScenarioContract/);
  assert.match(edge, /normalizedContainsPhrase/);
});

test("يصلح المفردات المرفوضة وحدها ويحفظ المقبولة", () => {
  assert.match(edge, /validateGeneratedItemsIndividually/);
  assert.match(edge, /scopedGenerationRequest/);
  assert.match(edge, /const accepted = new Map<string, GeneratedItem>/);
  assert.match(edge, /pendingIds = new Set\(batch\.failures/);
  assert.match(edge, /per_item_validation_failed/);
  assert.match(edge, /دون المساس ببقية الاختبار/);
});
