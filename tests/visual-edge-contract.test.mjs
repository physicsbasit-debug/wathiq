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

test("مراجع الصورة 2D يقرأ JSON حتى مع سياج Markdown أو نص زائد", async () => {
  const edge = await text("supabase/functions/science-visual-generation/index.ts");
  const parseJson = extractParseJson(edge);
  assert.deepEqual(parseJson('```json\n{"approved":true,"reason":"ok"}\n```'), { approved: true, reason: "ok" });
  assert.deepEqual(parseJson('نتيجة المراجعة:\n{"approved":false,"reason":"راجع الاتجاه"}\nتم.'), { approved: false, reason: "راجع الاتجاه" });
});

test("عامل المفردات لا يولد المخططات الخطية القديمة ويقصر التخطيط الحتمي على البيانات", async () => {
  const worker = await text("supabase/functions/assessment-generation-worker/index.ts");
  for (const oldType of ["force_diagram", "circuit_diagram", "electrostatic_diagram", "ray_diagram", "pressure_diagram", "flow_diagram", "instrument_scale"]) {
    assert.doesNotMatch(worker, new RegExp(oldType), oldType);
  }
  assert.match(worker, /"none", "illustration_2d", "data_table", "line_graph", "bar_chart"/);
  assert.match(worker, /أي مشهد علمي أو جهاز أو زنبرك أو قوة أو دائرة/);
  assert.match(worker, /studentVisibleQuestion/);
  const plannerStart = worker.indexOf("async function callVisualPlanner(");
  const plannerEnd = worker.indexOf("function emptyVisualProposal", plannerStart);
  const planner = worker.slice(plannerStart, plannerEnd);
  assert.doesNotMatch(planner, /answer:/);
  assert.doesNotMatch(planner, /markScheme:/);
});

test("وظيفة مهام الصور تقبل context_scene فقط وتمنع خلط الرسوم البيانية مع نموذج الصور", async () => {
  const jobs = await text("supabase/functions/question-visual-jobs/index.ts");
  assert.match(jobs, /isContextSceneJobInput/);
  assert.match(jobs, /STRUCTURED_VISUAL_RENDERED_LOCALLY/);
  assert.match(jobs, /textField\(visual\.type\) !== "context_scene"/);
  const duplicateRow = jobs.match(/const row = data as JobRow;/g) ?? [];
  assert.equal(duplicateRow.length, 1, "يجب ألا يعود تعريف row المكرر الذي يكسر Edge Function");
});

test("مولد الصور 2D يقبل المشاهد العلمية العامة ويفرض بوابة عدم كشف الإجابة", async () => {
  const edge = await text("supabase/functions/science-visual-generation/index.ts");
  assert.match(edge, /wathiq-science-2d-reset-v3/);
  assert.match(edge, /زنبركاً أو جهازاً أو قوة أو دائرة أو شحنات أو بصريات/);
  assert.match(edge, /noAnswerLeakage/);
  assert.match(edge, /ارفض الصورة إذا كشفت إجابة السؤال/);
  assert.doesNotMatch(edge, /هذه الوظيفة للمشهد السياقي فقط/);
});

test("مسار الواجهة يربط context_scene تلقائيًا بمهام الصور بدل انتظار زر يدوي", async () => {
  const app = await text("src/app.ts");
  assert.match(app, /function scheduleContextSceneVisualJobSync\(\)/);
  assert.match(app, /visualJobService\.enqueue\(state\.draft\.id, visualJobItems\(state\.draft, visualJobSubject\(\)\)\)/);
  assert.match(app, /scheduleContextSceneVisualJobSync\(\)/);
});

test("العقد canonical لا يحتوي أنواع التخطيط القديمة وجسرها محصور في قارئ المسودات", async () => {
  const types = await text("src/types.ts");
  const visual = await text("src/question-visual.ts");
  assert.match(types, /QuestionVisualType = "none" \| "context_scene" \| "line_graph" \| "bar_chart" \| "data_table"/);
  for (const oldType of ["force_diagram", "circuit_diagram", "electrostatic_diagram", "ray_diagram", "pressure_diagram", "flow_diagram", "instrument_scale"]) {
    assert.doesNotMatch(types, new RegExp(oldType), oldType);
    assert.match(visual, new RegExp(oldType), `يجب إبقاء ${oldType} في جسر الترحيل فقط`);
  }
  assert.match(visual, /LEGACY_SCHEMATIC_VISUAL_TYPES/);
  assert.match(visual, /return "context_scene"/);
});

test("تعليمات 2D تمنع الرسم الخطي البديل والأرقام المخترعة وكشف اتجاه الحل", async () => {
  const edge = await text("supabase/functions/science-visual-generation/index.ts");
  assert.match(edge, /لا يستخدم مولداً تخطيطياً خطياً/);
  assert.match(edge, /لا تخترع بيانات كمية داخل الصورة/);
  assert.match(edge, /لا تضف أسهماً أو رموز شحنة أو قيماً أو اتجاهات نتيجة من عندك/);
  assert.match(edge, /لا يستخدم واثق أي رسم خطي بديل/);
});
