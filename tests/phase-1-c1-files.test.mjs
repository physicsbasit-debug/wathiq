import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const generator = await readFile(new URL("../src/question-generation.ts", import.meta.url), "utf8");
const visual = await readFile(new URL("../src/question-visual.ts", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("يثبت إصدار محرك الرسومات ويعلن نطاقه بوضوح", () => {
  assert.equal(pkg.version, "0.0.35");
  assert.match(pkg.description, /SVG/);
  assert.match(readme, /Phase 1-C1/);
  assert.match(readme, /مواصفة بيانات منظمة/);
});

test("يدعم أربعة قوالب بصرية علمية ولا يقبل SVG حرًا", () => {
  assert.match(visual, /line_graph/);
  assert.match(visual, /bar_chart/);
  assert.match(visual, /pressure_diagram/);
  assert.match(visual, /circuit_diagram/);
  assert.match(visual, /escapeXml/);
  assert.doesNotMatch(visual, /innerHTML\s*=\s*spec/);
});

test("يربط الرسم بعقد Gemini ويعيد التحقق منه في الخادم", () => {
  assert.match(generator, /source-grounded-policy-ai-9-visual-svg/);
  assert.match(generator, /deriveQuestionVisualTarget/);
  assert.match(edge, /visualTarget/);
  assert.match(edge, /validateQuestionVisualSpec/);
  assert.match(edge, /مواصفة visual واحدة مشتركة/);
  assert.match(edge, /لا تضع الإجابة داخل عنوان الرسم/);
});

test("يعرض الرسم في البدائل وورقة الطالب ونموذج المعلم ويهيئه للطباعة", () => {
  assert.match(app, /renderPlanVisual/);
  assert.match(app, /renderQuestionVisualSvg/);
  assert.match(app, /العناصر البصرية/);
  assert.match(styles, /Phase 1-C1/);
  assert.match(styles, /@media print/);
  assert.match(styles, /break-inside:\s*avoid/);
});
