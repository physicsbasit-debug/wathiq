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

if (failures.length) {
  console.error("FAIL: runtime integrity gate");
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}

console.log(`PASS: runtime integrity gate | ${runtimeFiles.length} runtime files + canonical UI/kernel contracts checked`);
