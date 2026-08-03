import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ASSESSMENT_GENERATION_V2_VERSION } from "../dist/assets/assessment-generation-v2.js";

const text = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(await text("package.json"));
const edge = await text("supabase/functions/generate-source-questions/index.ts");
const scientific = await text("src/scientific-item.ts");

function blockBetween(startToken, endToken) {
  const start = edge.indexOf(startToken);
  const end = edge.indexOf(endToken, start + startToken.length);
  return edge.slice(start, end);
}

test("يثبت Fix 5 عقد التقييم المملوك للخادم", () => {
  assert.equal(pkg.version, "0.0.61");
  assert.equal(ASSESSMENT_GENERATION_V2_VERSION, "source-grounded-policy-ai-23-server-owned-assessment-contract");
  assert.match(edge, /buildServerOwnedScenarioContract/);
  assert.match(edge, /moment_system/);
  assert.match(edge, /stabilizeGeneratedPayloadMarkSchemes/);
});

test("لا يطلب Gemini حقول scenarioContract أو scientificItem الوصفية", () => {
  const schema = blockBetween("function generationSchema", "function parseGenerationRequest");
  assert.doesNotMatch(schema, /scenarioContract\s*:/);
  assert.doesNotMatch(schema, /scientificItem\s*:/);
  assert.match(edge, /لا تعد scenarioContract أو scientificItem/);
});

test("يفصل نموذج العزم عن نموذج القوة والاحتكاك", () => {
  assert.match(edge, /kind: "moment_system"/);
  assert.match(edge, /relationship: "moment"/);
  assert.match(edge, /kind: "moment_force"/);
  assert.match(edge, /kind: "lever_arm"/);
  assert.match(scientific, /model\.kind === "moment_system"/);
  assert.match(scientific, /visual\.variant !== "moments"/);
});

test("يخفض الزمن المهدور في الإصلاحات غير الضرورية", () => {
  assert.match(edge, /const maxRounds = request\.generationMode === "whole_exam_v2" \? 3 : 2/);
  assert.match(edge, /mark_scheme_normalized_locally/);
  const loop = blockBetween("async function generateAndValidate", "function exponentialBackoffWithJitter");
  assert.doesNotMatch(loop, /repairGeneratedPayloadMarkSchemes/);
  assert.match(loop, /stabilizeGeneratedPayloadMarkSchemes/);
});
