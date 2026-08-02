import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { sanitizeGeneratedQuestionText } from "../dist/assets/question-generation.js";
import {
  emptyQuestionVisualSpec,
  parseQuestionVisualSpec,
  renderQuestionVisualSvg,
} from "../dist/assets/question-visual.js";

const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("يثبت Fix 4 دون تغيير إصدار أو عقد محرك V2", () => {
  assert.match(pkg.version, /^0\.0\.(?:51|52|53|54)$/);
  assert.match(edge, /source-grounded-policy-ai-17-whole-exam-v2/);
});

test("ينظف معرفات التخطيط الداخلية قبل ظهورها في ورقة الطالب", () => {
  assert.equal(
    sanitizeGeneratedQuestionText("يوضح الشكل (visual-plan-3) تجربة شحن مسطرة."),
    "يوضح الشكل تجربة شحن مسطرة.",
  );
  assert.equal(
    sanitizeGeneratedQuestionText("بالجدول visual-plan-12، احسب القيمة."),
    "بالجدول، احسب القيمة.",
  );
  assert.match(edge, /sanitizeGeneratedDisplayText/);
  assert.match(edge, /INTERNAL_GENERATION_TOKEN_PATTERN/);
});

test("يمتلك حارسًا دلاليًا يمنع الجدول غير المرتبط بالسؤال", () => {
  assert.match(edge, /validateDataTableSemanticBinding/);
  assert.match(edge, /السؤال لا يستخدم معنى أعمدة الجدول أو بياناته/);
  assert.match(edge, /validateTableRowReferences/);
  assert.match(edge, /صف أو قياس رقم/);
});

test("يبني جداول متخصصة للموصلات والشحنة وقانون هوك بدل الجدول العام المتكرر", () => {
  assert.match(edge, /نتائج اختبار التوصيل الكهربائي/);
  assert.match(edge, /بيانات الشحنة الكهربائية/);
  assert.match(edge, /القوة واستطالة الزنبرك/);
  assert.match(edge, /قوة الدفع وكتلة الجسم/);
  assert.match(edge, /allowHiddenCell/);
});

test("يدعم رمز المحرك في الدوائر الكهربائية السياقية", () => {
  const visual = parseQuestionVisualSpec({
    ...emptyQuestionVisualSpec(),
    type: "circuit_diagram",
    variant: "measurement_circuit",
    title: "دائرة تحكم بمحرك",
    altText: "بطارية ومفتاح ومحرك وأميتر في دائرة كهربائية",
    components: ["battery", "switch_closed", "motor", "ammeter"],
    annotations: ["بطارية", "مفتاح مغلق", "محرك", "أميتر"],
  }, "circuit_diagram");
  const svg = renderQuestionVisualSvg(visual);
  assert.match(svg, />M</);
  assert.match(edge, /components\.includes\("motor"\)/);
});

test("يمنح V2 محاولة إصلاح إضافية قبل إظهار الفشل للمستخدم", () => {
  assert.match(edge, /const maxAttempts = request\.generationMode === "whole_exam_v2" \? 3 : 2/);
});
