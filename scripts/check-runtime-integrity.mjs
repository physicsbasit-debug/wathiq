import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;
const failures = [];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(join(ROOT, dir), { withFileTypes: true })) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(rel));
    else if (/\.(?:ts|js|mjs)$/iu.test(entry.name)) out.push(rel);
  }
  return out;
}

const runtimeFiles = [...await walk("src"), ...await walk("supabase/functions")];
const forbiddenRuntimePatterns = [
  { pattern: /@ts-nocheck/u, label: "تعطيل فحص TypeScript" },
  { pattern: /import\s+type\s*\{\s*\}\s+from/u, label: "استيراد type فارغ لا يصنع اعتماد runtime" },
  { pattern: /Visual Placeholder/u, label: "Placeholder بصري داخل مسار الإنتاج" },
  { pattern: /لاجتياز\s+(?:اختبار|فحص المعمارية)/u, label: "كود مضاف لإرضاء اختبار بدل السلوك الحقيقي" },
];

for (const file of runtimeFiles) {
  const source = await readFile(join(ROOT, file), "utf8");
  for (const { pattern, label } of forbiddenRuntimePatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(source)) failures.push(`${label}: ${file}`);
  }
}

const app = await readFile(join(ROOT, "src/app.ts"), "utf8");
const blueprint = await readFile(join(ROOT, "src/assessment-engine/blueprint.ts"), "utf8");
const contracts = await readFile(join(ROOT, "src/assessment-engine/contracts.ts"), "utf8");
const visualGenerator = await readFile(join(ROOT, "supabase/functions/science-visual-generation/index.ts"), "utf8");
const questionVisual = await readFile(join(ROOT, "src/question-visual.ts"), "utf8");
const visualTypes = await readFile(join(ROOT, "src/types.ts"), "utf8");
const generationWorker = await readFile(join(ROOT, "supabase/functions/assessment-generation-worker/index.ts"), "utf8");

// Freeze gate: يمنع استبدال واجهة واثق الكاملة بواجهة تجريبية صغيرة دون قرار معماري صريح وتحديث هذا العقد.
if (app.split("\n").length < 1200) failures.push("src/app.ts تقلصت دون تحديث عقد الاستعادة (<1200 سطر).");

const requiredAppMarkers = [
  /function\s+renderWizard\s*\(/u,
  /function\s+reviewReadiness\s*\(/u,
  /async\s+function\s+generateQuestionsForPlan\s*\(/u,
  /async\s+function\s+verifyContextSceneAssetsForExport\s*\(/u,
  /reviewCompletedAssessment\s*\(/u,
  /downloadWordHtml\s*\(/u,
  /printHtmlDocument\s*\(/u,
  /scheduleContextSceneVisualJobSync\s*\(/u,
];
for (const marker of requiredAppMarkers) {
  if (!marker.test(app)) failures.push(`مسار UI أساسي مفقود من src/app.ts: ${marker}`);
}

if (!/new\s+ProgressiveAssessmentGenerationOrchestrator\([\s\S]{0,240}concurrency:\s*2/u.test(app)) {
  failures.push("مسار الإنتاج لا يفعّل التوازي التشغيلي المحافظ (concurrency=2) بعد بوابة المفردة الأولى.");
}
if (/new\s+ProgressiveAssessmentGenerationOrchestrator\([\s\S]{0,240}concurrency:\s*1/u.test(app)) {
  failures.push("عاد مسار الإنتاج إلى concurrency=1 الدائم؛ هذا يلغي التوازي بعد نجاح بوابة المفردة الأولى.");
}

if (/export\s+function\s+renderQuestionVisualForPaper\s*\(/u.test(app)) {
  failures.push("src/app.ts يعيد تعريف renderQuestionVisualForPaper بدل استخدام الوحدة الأصلية.");
}
if (/verifyContextSceneAssetsForExport[\s\S]{0,300}return\s+Promise\.resolve\s*\(\s*\)/u.test(app)) {
  failures.push("verifyContextSceneAssetsForExport تحولت إلى no-op.");
}

if (!/export\s+async\s+function\s+buildAssessmentBlueprint\s*\(/u.test(blueprint)
    || !/assertBlueprintIntegrity\s*\(/u.test(blueprint)
    || /buildAssessmentBlueprint[\s\S]{0,300}return\s*\{\s*\}\s*;/u.test(blueprint)) {
  failures.push("buildAssessmentBlueprint ليست النواة الحقيقية أو تحولت إلى stub.");
}
if (!/export\s+async\s+function\s+buildAssessmentItemContracts\s*\(/u.test(blueprint)
    || /buildAssessmentItemContracts[\s\S]{0,300}return\s*\[\s*\]\s*;/u.test(blueprint)) {
  failures.push("buildAssessmentItemContracts مفقودة أو تحولت إلى stub.");
}
if (/function\s+buildAssessmentBlueprint[\s\S]{0,200}return\s*\{\s*\}/u.test(contracts)
    || /function\s+buildAssessmentItemContracts[\s\S]{0,200}return\s*\[\s*\]/u.test(contracts)) {
  failures.push("contracts.ts يحتوي نسخة stub موازية لدوال البناء.");
}

const parseJsonDefinitions = visualGenerator.match(/function\s+parseJson\s*\(/gu) ?? [];
if (parseJsonDefinitions.length > 1) failures.push("science-visual-generation يحتوي تعريفات parseJson مكررة.");

// Visual Reset 0.3.18: old schematic renderers are forbidden in production. Legacy names may exist only in the read-only migration set.
const forbiddenSchematicRenderers = [
  "renderForceDiagram", "renderCircuitDiagram", "renderRayDiagram",
  "renderPressureDiagram", "renderFlowDiagram", "renderInstrumentScale",
];
for (const renderer of forbiddenSchematicRenderers) {
  if (questionVisual.includes(`function ${renderer}`)) failures.push(`عاد مولد تخطيطي محظور إلى src/question-visual.ts: ${renderer}`);
}

const oldSchematicModes = [
  "force_diagram", "circuit_diagram", "electrostatic_diagram", "ray_diagram",
  "pressure_diagram", "flow_diagram", "instrument_scale",
];
for (const mode of oldSchematicModes) {
  if (generationWorker.includes(mode)) failures.push(`عاد النوع التخطيطي القديم إلى Worker: ${mode}`);
}

if (!/export\s+type\s+QuestionVisualType\s*=\s*"none"\s*\|\s*"context_scene"\s*\|\s*"line_graph"\s*\|\s*"bar_chart"\s*\|\s*"data_table"/u.test(visualTypes)) {
  failures.push("QuestionVisualType لم يعد محصورًا في none/context_scene والجدول/الرسم البياني الحتمي.");
}
for (const legacyGeometrySymbol of ["CircuitComponent", "QuestionVisualVector", "QuestionVisualAnchor", "QuestionVisualSegment", "QuestionVisualDimension"]) {
  if (visualTypes.includes(legacyGeometrySymbol)) failures.push(`بقايا هندسة المولد التخطيطي القديم ما زالت في src/types.ts: ${legacyGeometrySymbol}`);
}
if (!/LEGACY_SCHEMATIC_VISUAL_TYPES/u.test(questionVisual) || !/return\s+"context_scene"/u.test(questionVisual)) {
  failures.push("جسر ترحيل المرئيات التخطيطية القديمة إلى context_scene مفقود.");
}
if (!/wathiq-science-2d-reset-v3/u.test(visualGenerator) || !/noAnswerLeakage/u.test(visualGenerator)) {
  failures.push("science-visual-generation لا يطبق عقد 2D v3 مع بوابة منع تسريب الإجابة.");
}
if (!/studentVisibleQuestion\s*:\s*\{/u.test(generationWorker)) {
  failures.push("Visual Planner لا يستخدم studentVisibleQuestion بعد Visual Reset.");
}
const plannerStart = generationWorker.indexOf('role: "typed_scientific_visual_planner"');
const plannerEnd = plannerStart >= 0 ? generationWorker.indexOf("const planned = await callJsonModel", plannerStart) : -1;
const plannerPrompt = plannerStart >= 0 && plannerEnd > plannerStart ? generationWorker.slice(plannerStart, plannerEnd) : "";
if (!plannerPrompt || /\banswer\s*:/u.test(plannerPrompt) || /\bmarkScheme\s*:/u.test(plannerPrompt)) {
  failures.push("Visual Planner عاد لرؤية answer/markScheme أو تعذر إثبات عزله عنهما.");
}


// Visual handoff 0.3.20: persist directly, then kick the visual worker in background.
const serverVisualPersist = generationWorker.indexOf("await persistContextSceneVisualJob(");
const serverCompleteItem = generationWorker.indexOf('admin.rpc("complete_assessment_generation_item"');
if (serverVisualPersist < 0 || serverCompleteItem < 0 || serverVisualPersist > serverCompleteItem) {
  failures.push("عامل المفردات لا يحفظ Visual Job الدائمة قبل اعتماد المفردة ready.");
}
if (!/QUESTION_VISUAL_JOBS_TABLE/u.test(generationWorker)
  || !/VISUAL_JOB_PERSIST_TIMEOUT_MS\s*=\s*8_000/u.test(generationWorker)
  || !/scheduleContextSceneVisualKick/u.test(generationWorker)
  || !/EdgeRuntime\.waitUntil\(task\)/u.test(generationWorker)) {
  failures.push("التسليم غير الحاجب لمرئيات 2D أو مهلة حفظ المهمة مفقودة من Worker.");
}
const persistStart = generationWorker.indexOf("async function persistContextSceneVisualJob(");
const kickStart = generationWorker.indexOf("async function kickContextSceneVisualQueue(");
const persistBody = persistStart >= 0 && kickStart > persistStart ? generationWorker.slice(persistStart, kickStart) : "";
if (!persistBody || /await fetch\(QUESTION_VISUAL_JOBS_ENDPOINT/u.test(persistBody)) {
  failures.push("مسار حفظ السؤال عاد ينتظر Edge Function الصور عبر الشبكة.");
}
const visualJobsClient = await readFile(join(ROOT, "src/visual-jobs.ts"), "utf8");
if (!/returnedPlanItemIds/u.test(visualJobsClient) || !/missing\.length/u.test(visualJobsClient)) {
  failures.push("VisualJobService قد يعود لاعتبار jobs=[] نجاحًا صامتًا.");
}

if (failures.length) {
  console.error("FAIL: runtime integrity gate");
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}

console.log(`PASS: runtime integrity gate | ${runtimeFiles.length} runtime files + canonical UI/kernel contracts checked`);
