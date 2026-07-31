import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const text = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(await text("package.json"));
const app = await text("src/app.ts");
const domain = await text("src/domain.ts");
const storage = await text("src/storage.ts");
const client = await text("src/question-generation.ts");
const generator = await text("supabase/functions/generate-source-questions/index.ts");

function enrichmentToggleHandler() {
  const start = app.indexOf('document.querySelector<HTMLInputElement>("#trusted-enrichment-toggle")');
  const end = app.indexOf('document.querySelector<HTMLInputElement>("#duration-input")', start);
  return start >= 0 && end > start ? app.slice(start, end) : "";
}

test("يثبت Phase 1-C4 وإصدار التوليد الموثوق", () => {
  assert.ok(Number(pkg.version.split(".").at(-1)) >= 46);
  assert.match(client, /source-grounded-policy-ai-(?:14-contextual-stimulus-alignment|15-controlled-hybrid-visuals)/);
  assert.match(domain, /trustedEnrichmentEnabled:\s*true/);
  assert.match(storage, /candidate\.trustedEnrichmentEnabled !== false/);
});

test("يقدم خيار إثراء بسيطًا ولا يمسح الأسئلة المكتملة عند تغييره", () => {
  assert.match(app, /trusted-enrichment-toggle/);
  assert.match(app, /الإثراء من مصادر علمية رسمية وموثوقة/);
  const handler = enrichmentToggleHandler();
  assert.ok(handler);
  assert.doesNotMatch(handler, /invalidateGeneratedQuestions/);
  assert.match(handler, /لن تُحذف الأسئلة المكتملة/);
});

test("يفصل البحث الموثق عن التوليد المنظم ويبقي المرجع المدرسي حاكمًا", () => {
  assert.match(generator, /tools:\s*\[\{ google_search: \{\} \}\]/);
  assert.match(generator, /responseJsonSchema:\s*generationSchema/);
  assert.match(generator, /المرجع المدرسي.*الحاكم/u);
  assert.match(generator, /لا تعتبر ذاكرة النموذج مصدرًا/u);
  assert.match(generator, /enrichmentEvidenceId/);
  assert.match(generator, /groundingMetadata/);
});

test("يعيد المحاولة للضغط المؤقت دون تكرار دورة النقل مرتين", () => {
  assert.match(generator, /transportAttempt <= 3/);
  assert.match(generator, /exponentialBackoffWithJitter/);
  assert.match(generator, /isTransportRetryExhausted\(error\)/);
  assert.match(generator, /GENERATION_TEMPORARILY_UNAVAILABLE/);
  assert.match(generator, /النموذج مشغول مؤقتًا بسبب ارتفاع الطلب/);
});

test("يعالج ضعف دليل المقطع بفحص المرجع المدرسي الكامل دون قبول سؤال غريب", () => {
  assert.match(generator, /directEvidenceAffinity/);
  assert.match(generator, /fullReferenceAffinity/);
  assert.match(generator, /if \(!directEvidenceAffinity && !fullReferenceAffinity\)/);
  assert.match(generator, /needsReview: alternative\.needsReview \|\| weakAffinity \|\| commandReview/);
});
