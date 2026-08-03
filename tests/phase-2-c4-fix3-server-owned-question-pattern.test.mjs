import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ASSESSMENT_GENERATION_V2_VERSION } from "../dist/assets/assessment-generation-v2.js";

const text = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(await text("package.json"));
const edge = await text("supabase/functions/generate-source-questions/index.ts");

test("يثبت Fix 3 نمط السؤال بوصفه عقدًا خادميًا", () => {
  assert.match(pkg.version, /^0\.0\.(?:61|62|63)$/);
  assert.match(ASSESSMENT_GENERATION_V2_VERSION, /source-grounded-policy-ai-(?:22-server-owned-question-pattern|23-server-owned-assessment-contract|24-context-aware-moment-contract|25-essential-scientific-visual-contract)/);
  assert.match(edge, /serverQuestionPattern/);
  assert.match(edge, /questionForm: item\.styleTarget/);
  assert.match(edge, /workingRequired: shouldRequireCalculationWorking\(item\.styleTarget, item\.marks\)/);
});

test("لا يطلب من Gemini إعادة questionForm أو workingRequired", () => {
  const schemaStart = edge.indexOf("function generationSchema");
  const schemaEnd = edge.indexOf("function parseGenerationRequest", schemaStart);
  const schema = edge.slice(schemaStart, schemaEnd);
  assert.doesNotMatch(schema, /questionForm:\s*\{ type: "string"/);
  assert.doesNotMatch(schema, /workingRequired:\s*\{ type: "boolean"/);
  assert.doesNotMatch(schema, /"questionForm", "workingRequired"/);
});

test("يحقن الخادم النمط الرسمي قبل التحقق الدلالي", () => {
  assert.match(edge, /const serverWorkingRequired = shouldRequireCalculationWorking\(requestedStyleTarget, marks\)/);
  assert.match(edge, /questionForm: requestedStyleTarget/);
  assert.match(edge, /workingRequired: serverWorkingRequired/);
  assert.doesNotMatch(edge, /مولد الأسئلة لم يلتزم بنمط السؤال المحدد في الخطة/);
  assert.match(edge, /validateAssessmentQuality\(alternative, scenarioTarget, stimulusTarget, skillTarget, diversityKey, fixedVisual, scientificItem\)/);
});
