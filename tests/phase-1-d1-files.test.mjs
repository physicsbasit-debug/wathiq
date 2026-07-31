import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const text = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(await text("package.json"));
const app = await text("src/app.ts");
const types = await text("src/types.ts");
const visual = await text("src/question-visual.ts");
const client = await text("src/question-generation.ts");
const edge = await text("supabase/functions/generate-source-questions/index.ts");
const exporter = await text("src/exam-export.ts");
const styles = await text("src/styles.css");

test("يثبت Phase 1-D1 وإصدار الرسوم الهجينة المنضبطة", () => {
  assert.ok(Number(pkg.version.split(".").at(-1)) >= 47);
  assert.match(client, /source-grounded-policy-ai-(?:15-controlled-hybrid-visuals|16-assessment-quality-context-diversity)/);
  assert.match(types, /QuestionVisualIllustration/);
  assert.match(types, /visualEnhancementEnabled: boolean/);
});

test("يبقي الرسم الحتمي أساسًا ويقصر صورة AI على الأنواع الآمنة", () => {
  assert.match(visual, /isAiIllustrationEligible/);
  assert.match(visual, /question-visual-deterministic-fallback/);
  assert.match(visual, /question-visual-illustration/);
  assert.match(visual, /electrostatic_diagram.*charge_transfer/s);
  assert.match(visual, /pressure_diagram.*submerged_object/s);
});

test("تتيح الواجهة التحسين وإعادة التوليد والرجوع دون مسح الأسئلة", () => {
  assert.match(app, /visual-enhancement-toggle/);
  assert.match(app, /enhancePlanVisual/);
  assert.match(app, /regenerate-visual/);
  assert.match(app, /restore-deterministic-visual/);
  const start = app.indexOf('document.querySelector<HTMLInputElement>("#visual-enhancement-toggle")');
  const end = app.indexOf('document.querySelector<HTMLInputElement>("#duration-input")', start);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(app.slice(start, end), /invalidateGeneratedQuestions/);
});

test("تولد الوظيفة صورة 2D وتفحصها قبل التخزين مع رجوع آمن", () => {
  assert.match(edge, /gemini-3\.1-flash-image/);
  assert.match(edge, /generate_visual_illustration/);
  assert.match(edge, /validateControlledIllustration/);
  assert.match(edge, /visual_illustration_fallback/);
  assert.match(edge, /wathiq-question-visuals/);
  assert.match(edge, /responseModalities: \["IMAGE"\]/);
  assert.match(edge, /no words, no letters, no numbers, no units, no arrows/);
});

test("يحافظ تصدير Word وPDF على الصورة أو يعود إلى SVG عند تعذر تنزيلها", () => {
  assert.match(exporter, /imageUrlToDataUrl/);
  assert.match(exporter, /question-visual-deterministic-fallback/);
  assert.match(exporter, /hybrid\.dataset\.hybridVisual = "fallback"/);
  assert.match(styles, /question-visual-hybrid/);
  assert.match(styles, /max-height: 260px/);
  assert.match(app, /انتهت الأسئلة/);
});
