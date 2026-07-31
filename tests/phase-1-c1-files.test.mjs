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
  assert.match(pkg.version, /^0\.0\.(?:36|37|38|39)$/);
  assert.match(pkg.description, /SVG/);
  assert.match(readme, /Phase 1-C1/);
  assert.match(readme, /مواصفة SVG حتمية وآمنة|fixedVisual/);
});

test("يدعم أربعة قوالب بصرية علمية ولا يقبل SVG حرًا", () => {
  assert.match(visual, /line_graph/);
  assert.match(visual, /bar_chart/);
  assert.match(visual, /pressure_diagram/);
  assert.match(visual, /circuit_diagram/);
  assert.match(visual, /escapeXml/);
  assert.doesNotMatch(visual, /innerHTML\s*=\s*spec/);
});

test("يجعل الخادم مالك الرسم ويمنع ضياع السؤال بسبب مواصفة Gemini", () => {
  assert.match(generator, /source-grounded-policy-ai-(?:9-visual-svg|10-strict-lesson-scope)/);
  assert.match(generator, /deriveQuestionVisualTarget/);
  assert.match(edge, /visualTarget/);
  assert.match(edge, /buildServerOwnedVisualSpec/);
  assert.match(edge, /fixedVisual/);
  assert.match(edge, /لا تنشئ visual ولا تعدله ولا تعيده في JSON/);
  assert.doesNotMatch(edge, /required: \["planItemId", "visual", "alternatives"\]/);
});

test("يعرض الرسم في البدائل وورقة الطالب ونموذج المعلم ويهيئه للطباعة", () => {
  assert.match(app, /renderPlanVisual/);
  assert.match(app, /renderQuestionVisualSvg/);
  assert.match(app, /العناصر البصرية/);
  assert.match(styles, /Phase 1-C1/);
  assert.match(styles, /@media print/);
  assert.match(styles, /break-inside:\s*avoid/);
});
