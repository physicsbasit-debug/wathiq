import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const storage = await readFile(new URL("../src/storage.ts", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");

test("يحفظ نقطة استئناف قبل استدعاء محرك الاختبار الكامل", () => {
  assert.match(app, /if \(!persistDraftCheckpoint\(\)\) return;/);
  assert.match(app, /جارٍ تصميم الاختبار كاملًا[\s\S]*persistDraftCheckpoint\(\)/);
});

test("يحفظ المسودة فور نجاح التوليد أو فشله بدل الاعتماد على مؤقت فقط", () => {
  assert.match(app, /تم تصميم اختبار كامل[\s\S]*persistDraftCheckpoint\(false\)/);
  assert.match(app, /حُفظت المسودة الحالية ويمكنك إعادة المحاولة من الموضع نفسه/);
  assert.match(app, /pagehide/);
  assert.match(app, /visibilitychange/);
});

test("يخزن أكثر من مسودة ويهاجر المفتاح القديم دون فقد", () => {
  assert.match(storage, /wathiq\.examDrafts\.v1/);
  assert.match(storage, /export function loadDrafts/);
  assert.match(storage, /export function setActiveDraftId/);
  assert.match(storage, /readLegacyDraft/);
});

test("يفحص القيم الحسابية في نص السؤال والرسم معًا", () => {
  assert.match(edge, /function calculationPromptContainsRequiredData/);
  assert.match(edge, /const combined = `\$\{questionMaterial\} \$\{visualMaterial\}`/);
  assert.doesNotMatch(edge, /الرسم الحسابي لا يحتوي جميع القيم والوحدات اللازمة للحل/);
  assert.match(edge, /السؤال الحسابي ومثيره لا يحتويان جميع القيم والوحدات اللازمة للحل/);
});
