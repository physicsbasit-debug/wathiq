import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ASSESSMENT_GENERATION_V2_VERSION } from "../dist/assets/assessment-generation-v2.js";

const text = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(await text("package.json"));
const edge = await text("supabase/functions/generate-source-questions/index.ts");

test("يثبت Fix 6 عقد العزم الواعي بالمشهد الحياتي", () => {
  assert.match(pkg.version, /^0\.0\.(?:62|63)$/);
  assert.match(ASSESSMENT_GENERATION_V2_VERSION, /source-grounded-policy-ai-(?:24-context-aware-moment-contract|25-essential-scientific-visual-contract)/);
  assert.match(edge, /generationItemHasMomentConcept/);
  assert.match(edge, /momentScenarioVisualLabels/);
  assert.match(edge, /تحديد محور الدوران وموضع تأثير القوة وذراع القوة/);
});

test("تقرأ بوابة العزم الحقول المرئية المنظمة لا النص الحر وحده", () => {
  const start = edge.indexOf("function buildMomentValidationCorpus");
  const end = edge.indexOf("function validateAssessmentQuality", start);
  const block = edge.slice(start, end);
  assert.match(block, /fixedVisual\.tableColumns/);
  assert.match(block, /fixedVisual\.tableRows/);
  assert.match(block, /fixedVisual\.tableCells\.flat\(\)/);
});
