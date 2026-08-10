import { readFile, access } from "node:fs/promises";

const root = new URL("../", import.meta.url);

const read = async (path) => readFile(new URL(path, root), "utf8");
const exists = async (path) => {
  try {
    await access(new URL(path, root));
    return true;
  } catch {
    return false;
  }
};

const checks = [];
const record = (name, pass, detail = "") => checks.push({ name, pass, detail });

const packageJson = JSON.parse(await read("package.json"));
const patch = Number(String(packageJson.version ?? "").split(".")[2] ?? -1);
record("الإصدار لا يقل عن v0.0.66", Number.isInteger(patch) && patch >= 66, `وجد: ${packageJson.version}`);

const app = await read("src/app.ts");
const orchestrator = await read("src/assessment-generation-orchestrator.ts");
const d4Tests = await read("tests/phase-2-d4-progressive-generation-ui.test.mjs");

record(
  "واجهة الإنتاج تستخدم خدمة دورات D2",
  /new AssessmentGenerationJobService\(/u.test(app),
);
record(
  "واجهة الإنتاج تستخدم عامل المفردة D3",
  /new AssessmentGenerationWorkerService\(/u.test(app),
);
record(
  "واجهة الإنتاج تستخدم منسق D4 بتوازي 2",
  /new ProgressiveAssessmentGenerationOrchestrator[\s\S]*concurrency:\s*2/u.test(app),
);
record(
  "المسار الإنتاجي لا يستدعي generateWholeExam",
  !/generateWholeExam/u.test(app),
);
record(
  "المسار الإنتاجي لا ينشئ QuestionGenerationService القديم",
  !/new QuestionGenerationService/u.test(app),
);
record(
  "نمط المسودة الإنتاجي progressive_items_v1 موجود",
  /generationMode\s*=\s*"progressive_items_v1"/u.test(app),
);
record(
  "فحص صحة عامل المفردة يسبق دورة التوليد",
  /await assessmentGenerationWorkerService\.health\(\)/u.test(app)
    && /engineSchemaVersion\s*!==\s*1/u.test(app)
    && /contractVersion\s*!==\s*1/u.test(app),
);
record(
  "المنسق يحد التوازي افتراضيًا إلى مهمتين",
  /concurrency\s*\?\?\s*2/u.test(orchestrator),
);
record(
  "المهام الجاهزة ليست قابلة لإعادة الإرسال",
  /DISPATCHABLE_ITEM_STATUSES\s*=\s*new Set\(\["queued",\s*"retry_pending"\]\)/u.test(orchestrator),
);
record(
  "مهلة التهدئة موجودة لمنع إعادة الاستدعاء السريع",
  /dispatchCooldownMs/u.test(orchestrator) && /dispatchedAt/u.test(orchestrator),
);
record(
  "اختبارات D4 تغطي الاستكمال بعد تحديث الصفحة",
  /يستعيد D4 الدورة بعد مزامنة المصادر/u.test(d4Tests),
);
record(
  "اختبارات D4 تغطي التوازي وعدم إعادة الجاهز",
  /مهمتين فقط بالتوازي/u.test(d4Tests) && /دون إعادة الجاهز/u.test(d4Tests),
);

for (const path of [
  "supabase/functions/assessment-generation-jobs/index.ts",
  "supabase/functions/assessment-generation-worker/index.ts",
]) {
  record(`وظيفة Edge موجودة: ${path}`, await exists(path));
}

const failed = checks.filter((check) => !check.pass);
for (const check of checks) {
  console.log(`${check.pass ? "PASS" : "FAIL"}: ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
}
console.log(`\nSUMMARY: PASS ${checks.length - failed.length} | FAIL ${failed.length}`);

if (failed.length) process.exitCode = 1;
