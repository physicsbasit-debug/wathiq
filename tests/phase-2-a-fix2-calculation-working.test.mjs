import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");
const questionGeneration = await readFile(new URL("../src/question-generation.ts", import.meta.url), "utf8");
const assessmentV2 = await readFile(new URL("../src/assessment-generation-v2.ts", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("يثبت إصدار Phase 2-A Fix 2", () => {
  assert.match(pkg.version, /^0\.0\.(?:50|51|52|53|54|55|56|57|58|59|60|61|62|63)$/);
});

test("يستبدل رفض workingRequired بتطبيع حتمي حسب عدد الدرجات", () => {
  assert.match(edge, /function shouldRequireCalculationWorking\(questionForm: QuestionDesignPattern, marks: number\)/);
  assert.match(edge, /const serverWorkingRequired = shouldRequireCalculationWorking\(requestedStyleTarget, marks\)/);
  assert.doesNotMatch(edge, /السؤال الحسابي لا يطلب إظهار خطوات الحل/);
  assert.match(questionGeneration, /shouldRequireCalculationWorking\(questionForm \?\? expected\.styleTarget, expected\.marks\)/);
  assert.match(assessmentV2, /shouldRequireCalculationWorking\(expected\.styleTarget, expected\.marks\)/);
});

test("يبقي مسودة V2 على المحرك المختار عند فشل محاولة التوليد", () => {
  assert.match(app, /بقيت المسودة على محرك تصميم الاختبار كاملًا ولم يغيّر واثق طريقة التوليد/);
});
