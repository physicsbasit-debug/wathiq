import { assertWathiqPatchAtLeast } from "./version-assertions.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");
const questionGeneration = await readFile(new URL("../src/question-generation.ts", import.meta.url), "utf8");
const assessmentV2 = await readFile(new URL("../src/assessment-generation-v2.ts", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("يثبت إصدار Phase 2-A Fix 2", () => {
  assertWathiqPatchAtLeast(pkg.version, 50);
});

test("يستبدل رفض workingRequired بتطبيع حتمي حسب عدد الدرجات", () => {
  assert.match(edge, /function shouldRequireCalculationWorking\(questionForm: QuestionDesignPattern, marks: number\)/);
  assert.match(edge, /const serverWorkingRequired = shouldRequireCalculationWorking\(requestedStyleTarget, marks\)/);
  assert.doesNotMatch(edge, /السؤال الحسابي لا يطلب إظهار خطوات الحل/);
  assert.match(questionGeneration, /shouldRequireCalculationWorking\(questionForm \?\? expected\.styleTarget, expected\.marks\)/);
  assert.match(assessmentV2, /shouldRequireCalculationWorking\(expected\.styleTarget, expected\.marks\)/);
});

test("لا يعود مسار الإنتاج إلى محرك V2 عند تعذر مفردة", () => {
  assert.match(app, /state\.draft\.generationMode = "progressive_items_v1"/);
  assert.match(app, /retryGenerationItem/);
  assert.doesNotMatch(app, /state\.draft\.generationMode = "whole_exam_v2"/);
  assert.doesNotMatch(app, /state\.draft\.generationMode = "legacy_items"/);
});
