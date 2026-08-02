import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const text = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(await text("package.json"));
const app = await text("src/app.ts");
const client = await text("src/question-generation.ts");
const storage = await text("src/storage.ts");
const generator = await text("supabase/functions/generate-source-questions/index.ts");

test("يثبت Fix 1 توافق المتن البصري ويحافظ على مسودات C4 الجزئية", () => {
  assert.ok(Number(pkg.version.split(".").at(-1)) >= 46);
  assert.match(client, /source-grounded-policy-ai-(?:14-contextual-stimulus-alignment|15-controlled-hybrid-visuals|16-assessment-quality-context-diversity)/);
  assert.match(storage, /source-grounded-policy-ai-13-trusted-enrichment/);
  assert.match(generator, /hasSufficientQuestionContext/);
});

test("يمرر سبب الرفض إلى المحاولة الثانية ويوسع مرجع الرسم للجدول والتدريج", () => {
  assert.match(generator, /previousValidationError/);
  assert.match(generator, /repairFeedback = itemRepairFeedback\(batch\.failures\)/);
  assert.match(generator, /الجدول\|التدريج\|الجهاز/);
  assert.match(generator, /يجوز أن يكون فارغًا في السؤال البصري/);
});


test("يعزل الدفعة الفاشلة إلى مفردات مستقلة ويحفظ المفردة السليمة", () => {
  assert.match(app, /if \(batch\.length === 1\) throw batchError/);
  assert.match(app, /for \(const isolatedItem of batch\)/);
  assert.match(app, /حتى لا تضيع المفردة السليمة/);
});
