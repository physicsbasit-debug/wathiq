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
  assert.match(edge, /responseJsonSchema:\s*generationSchema\(\s*request\.items,\s*(?:evidenceCatalog|evidenceCatalog\.fragments\.map)/);
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
  assert.match(edge, /per_item_validation_failed/);
  assert.match(edge, /failedItemIds/);
  assert.match(edge, /whole_exam_global_review_failed/);
});

test("يقيد مخطط JSON بمعرفات الدفعة وبالمفتاح items", () => {
  assert.match(edge, /requiredTopLevelKey:\s*"items"/);
  assert.match(edge, /prefixItems:\s*requestedItems\.map/);
  assert.match(edge, /enum:\s*\[requestedItem\.planItemId\]/);
  assert.match(edge, /required:\s*\["items"\]/);
  assert.match(edge, /minItems:\s*requestedItems\.length/);
  assert.match(edge, /maxItems:\s*requestedItems\.length/);
});

test("يرفع إصدار مولد الأسئلة بعد الإصلاح", () => {
  assert.match(generator, /source-grounded-policy-ai-(?:6-generate-content|7-evidence-anchors|8-cambridge-style|9-visual-svg|10-strict-lesson-scope|11-visual-enforced|12-advanced-visuals|13-trusted-enrichment|14-contextual-stimulus-alignment|15-controlled-hybrid-visuals|16-assessment-quality-context-diversity)/);
  assert.match(pkg.version, /^0\.0\.(?:32|33|34|35|36|37|38|39|40|41|42|43|44|45|46|47|48|49|50|51|52|53|54|55|56|57)$/);
});
