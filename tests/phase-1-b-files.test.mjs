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

test("Edge Function تستخدم Gemini Interactions API ومخطط JSON ومفتاحًا سريًا", () => {
  assert.match(edge, /generativelanguage\.googleapis\.com\/v1\/interactions/);
  assert.match(edge, /GEMINI_API_KEY/);
  assert.match(edge, /x-goog-api-key/);
  assert.match(edge, /system_instruction/);
  assert.match(edge, /response_format/);
  assert.match(edge, /mime_type:\s*"application\/json"/);
  assert.match(edge, /schema:\s*generationSchema\(request\.items\.length\)/);
  assert.match(edge, /store:\s*false/);
  assert.match(edge, /sourceSupport/);
  assert.match(edge, /admin\.auth\.getUser/);
  assert.doesNotMatch(edge, /OPENAI_API_KEY|api\.openai\.com/);
});

test("تسجل Supabase الوظيفة الجديدة ويُرفع إصدار واثق", () => {
  assert.match(config, /\[functions\.generate-source-questions\]/);
  assert.match(config, /verify_jwt\s*=\s*false/);
  assert.equal(pkg.version, "0.0.29");
});
