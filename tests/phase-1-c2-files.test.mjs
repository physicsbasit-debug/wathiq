import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const exporter = await readFile(new URL("../src/exam-export.ts", import.meta.url), "utf8");
const storage = await readFile(new URL("../src/storage.ts", import.meta.url), "utf8");
const visual = await readFile(new URL("../src/question-visual.ts", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("يثبت إصدار C2 ونطاق التجميع والاعتماد والتصدير", () => {
  assert.match(pkg.version, /^0\.0\.(?:37|38|39|40|41|42|43|44|45|46|47|48|49|50|51|52|53|54|55|56|57|58|59|60|61|62)$/);
  assert.match(pkg.description, /اعتماد|تصدير/);
  assert.match(app, /interleaveAssessmentItems/);
  assert.match(app, /اعتماد الاختبار/);
  assert.match(app, /إلغاء الاعتماد للتعديل/);
});

test("يوفر تصدير الطالب ونموذج الإجابة إلى Word والطباعة PDF", () => {
  assert.match(app, /export-student-word/);
  assert.match(app, /export-answer-word/);
  assert.match(app, /export-student-pdf/);
  assert.match(app, /export-answer-pdf/);
  assert.match(exporter, /application\/msword/);
  assert.match(exporter, /prepareWordHtml/);
  assert.match(exporter, /canvas\.toDataURL\("image\/png"\)/);
  assert.match(exporter, /SVG_RASTER_STYLES/);
  assert.match(exporter, /frameWindow\.print\(\)/);
  assert.match(exporter, /dir="rtl"/);
  assert.match(styles, /Phase 1-C2/);
});

test("ينوّع الرسومات القديمة والجديدة محليًا دون طلب Gemini إضافي", () => {
  assert.match(visual, /diversifyQuestionVisualSpec/);
  assert.match(storage, /normalizeStoredPlan/);
  assert.match(edge, /visualId/);
  assert.match(edge, /depth_comparison/);
  assert.match(edge, /force_area/);
  assert.doesNotMatch(app, /generate-visual-via-gemini/);
});

test("يقفل خطوات التعديل بعد الاعتماد ويطلب مراجعة المعلم قبل الاستخدام", () => {
  assert.match(app, /الاختبار معتمد\. ألغِ الاعتماد أولًا/);
  assert.match(app, /تحتاج مراجعة المعلم قبل الاستخدام/);
  assert.match(app, /state\.draft\.status === "معتمد"/);
});
