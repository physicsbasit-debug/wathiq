import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");
const generator = await readFile(new URL("../src/question-generation.ts", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("تستخدم generateContent الرسمي المتوافق مع Gemini 2.5 Flash", () => {
  assert.match(edge, /v1beta\/models\/\$\{encodeURIComponent\(GEMINI_MODEL\)\}:generateContent/);
  assert.match(edge, /systemInstruction:/);
  assert.match(edge, /contents:\s*\[\{/);
  assert.match(edge, /responseMimeType:\s*"application\/json"/);
  assert.match(edge, /responseJsonSchema:\s*generationSchema\(request\.items,\s*evidenceCatalog\.fragments\.map/);
  assert.match(edge, /store:\s*false/);
  assert.doesNotMatch(edge, /\/interactions/);
  assert.doesNotMatch(edge, /response_format/);
});

test("تقرأ candidates content parts وتتحقق من finishReason", () => {
  assert.match(edge, /findGenerateContentOutputText/);
  assert.match(edge, /record\.candidates/);
  assert.match(edge, /content\.parts/);
  assert.match(edge, /finishReason === "STOP"/);
  assert.match(edge, /finishReason === "MAX_TOKENS"/);
  assert.match(edge, /promptFeedback/);
  assert.match(edge, /generation_validation_failed/);
  assert.match(edge, /topLevelKeys/);
});

test("يقيد مخطط JSON بمعرفات الدفعة وبالمفتاح items", () => {
  assert.match(edge, /requiredTopLevelKey:\s*"items"/);
  assert.match(edge, /enum:\s*requestedIds/);
  assert.match(edge, /required:\s*\["items"\]/);
  assert.match(edge, /minItems:\s*requestedItems\.length/);
  assert.match(edge, /maxItems:\s*requestedItems\.length/);
});

test("يرفع إصدار مولد الأسئلة بعد الإصلاح", () => {
  assert.match(generator, /source-grounded-policy-ai-(?:6-generate-content|7-evidence-anchors|8-cambridge-style|9-visual-svg|10-strict-lesson-scope)/);
  assert.match(pkg.version, /^0\.0\.(?:32|33|34|35|36|37|38|39|40)$/);
});
