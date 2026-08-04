import { assertWathiqPatchAtLeast } from "./version-assertions.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const generator = await readFile(new URL("../src/question-generation.ts", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");
const config = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("يبقي خدمة Phase 1-B التاريخية للأرشيف ويستخدم في الإنتاج دورة المفردات الدائمة", () => {
  assert.match(generator, /QuestionGenerationService/);
  assert.match(generator, /buildQuestionGenerationRequest/);
  assert.match(generator, /ثلاثة بدائل لكل مفردة/);
  assert.match(app, /AssessmentGenerationJobService/);
  assert.match(app, /ProgressiveAssessmentGenerationOrchestrator/);
  assert.match(app, /generateQuestionsForPlan/);
  assert.doesNotMatch(app, /new QuestionGenerationService/);
  assert.doesNotMatch(app, /generateProposals/);
});

test("Edge Function تستخدم Gemini generateContent ومخطط JSON ومفتاحًا سريًا", () => {
  assert.match(edge, /generativelanguage\.googleapis\.com\/v1beta\/models\/\$\{encodeURIComponent\(GEMINI_MODEL\)\}:generateContent/);
  assert.match(edge, /GEMINI_API_KEY/);
  assert.match(edge, /x-goog-api-key/);
  assert.match(edge, /systemInstruction/);
  assert.match(edge, /responseMimeType:\s*"application\/json"/);
  assert.match(edge, /responseJsonSchema:\s*generationSchema\(\s*request\.items,\s*(?:evidenceCatalog|evidenceCatalog\.fragments\.map)/);
  assert.match(edge, /sourceSupport/);
  assert.match(edge, /admin\.auth\.getUser/);
  assert.doesNotMatch(edge, /OPENAI_API_KEY|api\.openai\.com/);
});

test("تسجل Supabase الوظيفة الجديدة ويُرفع إصدار واثق", () => {
  assert.match(config, /\[functions\.generate-source-questions\]/);
  assert.match(config, /verify_jwt\s*=\s*false/);
  assertWathiqPatchAtLeast(pkg.version, 32);
});
