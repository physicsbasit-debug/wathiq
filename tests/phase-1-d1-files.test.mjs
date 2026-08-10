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

test("يفرض أصل 2D للأنواع المؤهلة ولا يعرض الرسم الخطي كرجوع نهائي", () => {
  assert.match(visual, /isAiIllustrationEligible/);
  assert.doesNotMatch(visual, /question-visual-deterministic-fallback/);
  assert.match(visual, /question-visual-2d-placeholder/);
  assert.match(visual, /question-visual-illustration/);
  assert.match(visual, /electrostatic_diagram.*charge_transfer/s);
  assert.match(visual, /pressure_diagram.*submerged_object/s);
});

test("تنقل الواجهة المرئيات من تحسين اختياري إلى مهام دائمة قابلة للاستئناف", () => {
  assert.match(app, /VisualJobService/);
  assert.match(app, /syncVisualJobs/);
  assert.match(app, /retryVisualJob/);
  assert.match(app, /VISUAL_JOB_POLL_INTERVAL_MS/);
  assert.match(app, /لا تُعامل كزينة اختيارية/);
  assert.doesNotMatch(app, /visual-enhancement-toggle/);
});

test("تولد الوظيفة صورة 2D وتفحصها قبل التخزين وترفض الرجوع الخطي", () => {
  assert.match(edge, /gemini-3\.1-flash-image/);
  assert.match(edge, /generate_visual_illustration/);
  assert.match(edge, /validateControlledIllustration/);
  assert.match(edge, /visual_illustration_rejected/);
  assert.match(edge, /لم يعتمد واثق أي رسم خطي بديل/);
  assert.match(edge, /wathiq-question-visuals/);
  assert.match(edge, /responseModalities: \["IMAGE"\]/);
  assert.match(edge, /no words, no letters, no numbers, no units, no arrows/);
});

test("يوحد Word وPDF على الأصل البصري نفسه ولا يسمح برجوع صامت", () => {
  assert.match(exporter, /imageUrlToDataUrl/);
  assert.match(exporter, /compositeVisualToPngDataUrl/);
  assert.match(exporter, /question-visual-composite/);
  assert.doesNotMatch(exporter, /hybrid\.dataset\.hybridVisual = "fallback"/);
  assert.match(styles, /question-visual-composite/);
  assert.match(app, /لا يمكن التصدير قبل اكتمال الأصول البصرية/);
});
