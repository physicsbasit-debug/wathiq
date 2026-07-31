import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");
const generator = await readFile(new URL("../src/question-generation.ts", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("تبقي استخراج JSON المتوازن ورمز التتبع بعد ترحيل واجهة Gemini", () => {
  assert.match(edge, /extractFirstJsonObject/);
  assert.match(edge, /let inString = false/);
  assert.match(edge, /let escaped = false/);
  assert.match(edge, /stripMarkdownFence/);
  assert.match(edge, /createRequestId/);
  assert.match(generator, /رمز التتبع/);
  assert.match(pkg.version, /^0\.0\.(?:32|33|34|35|36|37|38|39|40|41)$/);
});

test("لا تسجل نص المصدر أو مفتاح Gemini في مراحل التشخيص", () => {
  assert.match(edge, /gemini_request_started/);
  assert.match(edge, /gemini_response_received/);
  assert.doesNotMatch(edge, /logStage\([^\n]+reference\.content/);
  assert.doesNotMatch(edge, /logStage\([^\n]+GEMINI_API_KEY/);
});
