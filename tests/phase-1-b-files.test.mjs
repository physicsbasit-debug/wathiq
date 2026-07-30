import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const generator = await readFile(new URL("../src/question-generation.ts", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");
const config = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("Phase 1-B يستبدل الصياغات الوهمية بخدمة توليد من المصدر", () => {
  assert.match(app, /QuestionGenerationService/);
  assert.match(app, /generateQuestionsForPlan/);
  assert.match(app, /buildQuestionGenerationRequest/);
  assert.doesNotMatch(app, /generateProposals/);
  assert.doesNotMatch(app, /visualKind/);
  assert.match(generator, /ثلاثة بدائل لكل مفردة/);
});

test("Edge Function تستخدم Gemini generateContent ومخطط JSON ومفتاحًا سريًا", () => {
  assert.match(edge, /generativelanguage\.googleapis\.com\/v1beta\/models\/\$\{encodeURIComponent\(GEMINI_MODEL\)\}:generateContent/);
  assert.match(edge, /GEMINI_API_KEY/);
  assert.match(edge, /x-goog-api-key/);
  assert.match(edge, /systemInstruction/);
  assert.match(edge, /responseMimeType:\s*"application\/json"/);
  assert.match(edge, /responseJsonSchema:\s*generationSchema\(request\.items,\s*evidenceCatalog\.fragments\.map/);
  assert.match(edge, /sourceSupport/);
  assert.match(edge, /admin\.auth\.getUser/);
  assert.doesNotMatch(edge, /OPENAI_API_KEY|api\.openai\.com/);
});

test("تسجل Supabase الوظيفة الجديدة ويُرفع إصدار واثق", () => {
  assert.match(config, /\[functions\.generate-source-questions\]/);
  assert.match(config, /verify_jwt\s*=\s*false/);
  assert.match(pkg.version, /^0\.0\.(?:32|33|34|35|36|37|38|39)$/);
});
