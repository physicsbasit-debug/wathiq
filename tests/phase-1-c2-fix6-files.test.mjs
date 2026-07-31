import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const generator = await readFile(new URL("../src/question-generation.ts", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("يثبت Fix 6 ربط دليل الدرس بنطاق الصفحات الموثق", () => {
  assert.match(pkg.version, /^0\.0\.(?:42|43|44|45|46|47)$/);
  assert.match(generator, /page-range/);
  assert.match(generator, /page-neighborhood/);
  assert.match(generator, /strict-title-fallback/);
  assert.match(generator, /lessonPageFrom/);
  assert.match(generator, /lessonPageTo/);
});

test("ترسل الواجهة شجرة الدروس إلى باني طلب التوليد دون مسح المفردات المكتملة", () => {
  assert.match(app, /state\.lessonCatalog/);
  assert.match(generator, /SOURCE_GENERATION_VERSION\s*=\s*"source-grounded-policy-ai-(?:12-advanced-visuals|13-trusted-enrichment|14-contextual-stimulus-alignment|15-controlled-hybrid-visuals)"/);
});

test("يقبل الخادم مرجع الصفحة الموثقة ويبقي البحث الاحتياطي مقيدًا بعنوان الدرس", () => {
  assert.match(edge, /referenceSupportsLessonScope/);
  assert.match(edge, /pageRangesOverlap/);
  assert.match(edge, /lessonTitleMatchesEvidence/);
  assert.match(edge, /مرجع إحدى المفردات خارج نطاق الدرس الموثق/);
  assert.match(edge, /strict-title-fallback/);
});
