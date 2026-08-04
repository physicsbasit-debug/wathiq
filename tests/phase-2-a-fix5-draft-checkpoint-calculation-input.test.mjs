import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const storage = await readFile(new URL("../src/storage.ts", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");

test("يحفظ نقطة استئناف قبل إطلاق دورة التوليد التدريجي", () => {
  assert.match(app, /state\.draft\.generationMode = "progressive_items_v1"[\s\S]*if \(!persistDraftCheckpoint\(\)\) return;[\s\S]*setStep\(3\)/);
  assert.match(app, /window\.setTimeout\(\(\) => \{ void generateQuestionsForPlan/);
});

test("يحفظ كل لقطة تقدم ونتيجة قبل الاعتماد على مؤقت الواجهة", () => {
  assert.match(app, /applyProgressiveGenerationSnapshot[\s\S]*persistDraftCheckpoint\(false\)/);
  assert.match(app, /generationRunId = snapshot\.id/);
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
