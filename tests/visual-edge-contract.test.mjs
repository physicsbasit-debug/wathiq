import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const text = (relativePath) => readFile(new URL(relativePath, root), "utf8");

function extractParseJson(source) {
  const start = source.indexOf("function parseJson(value: string): unknown {");
  const end = source.indexOf("\nasync function requireUser", start);
  assert.ok(start >= 0 && end > start);
  const functionSource = source.slice(start, end)
    .replace("function parseJson(value: string): unknown", "function parseJson(value)");
  return new Function("httpError", `${functionSource}; return parseJson;`)((message) => new Error(message));
}

test("مراجع المشهد السياقي يقرأ JSON حتى مع سياج Markdown أو نص زائد", async () => {
  const edge = await text("supabase/functions/science-visual-generation/index.ts");
  const parseJson = extractParseJson(edge);
  assert.deepEqual(parseJson('```json\n{"approved":true,"reason":"ok"}\n```'), { approved: true, reason: "ok" });
  assert.deepEqual(parseJson('نتيجة المراجعة:\n{"approved":false,"reason":"راجع الاتجاه"}\nتم.'), { approved: false, reason: "راجع الاتجاه" });
});

test("عامل المفردات يطلب بيانات منظمة للرسوم العلمية الدقيقة ويمنع فقد قيم القوى", async () => {
  const worker = await text("supabase/functions/assessment-generation-worker/index.ts");
  assert.match(worker, /force_diagram/);
  assert.match(worker, /components/);
  assert.match(worker, /annotations/);
  assert.match(worker, /vectors/);
  assert.match(worker, /magnitude/);
  assert.match(worker, /unit/);
  assert.match(worker, /رسم القوى لا يحمل كل القيم العددية الواردة في السؤال/);
  assert.match(worker, /استخدم illustration_2d للمشهد السياقي فقط/);
});

test("وظيفة مهام الصور لا ترسل المخططات المنظمة إلى مولد الصور حتى مع عميل قديم", async () => {
  const jobs = await text("supabase/functions/question-visual-jobs/index.ts");
  assert.match(jobs, /isContextSceneJobInput/);
  assert.match(jobs, /STRUCTURED_VISUAL_RENDERED_LOCALLY/);
  assert.match(jobs, /المخططات العلمية المنظمة لا تنشئ مهام صور/);
  const duplicateRow = jobs.match(/const row = data as JobRow;/g) ?? [];
  assert.equal(duplicateRow.length, 1, "يجب ألا يعود تعريف row المكرر الذي يكسر Edge Function");
});

test("عامل المفردات يفرض هندسة العزم داخل المرئي المنظم", async () => {
  const worker = await text("supabase/functions/assessment-generation-worker/index.ts");
  assert.match(worker, /anchors/);
  assert.match(worker, /segments/);
  assert.match(worker, /dimensions/);
  assert.match(worker, /مسألة العزم تحتاج تمثيل الساق أو القضيب هندسيًا داخل الرسم/);
  assert.match(worker, /مسألة العزم تحتاج نقطة ارتكاز مسماة داخل الرسم/);
  assert.match(worker, /رسم العزم لا يحمل كل المسافات العددية اللازمة للحل/);
});
