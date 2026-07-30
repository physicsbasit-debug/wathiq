import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");
const generator = await readFile(new URL("../src/question-generation.ts", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("Phase 1-B5 تجمع جميع أجزاء النص من model_output بدل أول جزء فقط", () => {
  assert.match(edge, /const textParts: string\[\] = \[\]/);
  assert.match(edge, /textParts\.push\(contentRecord\.text\)/);
  assert.match(edge, /textParts\.join\(""\)/);
  assert.doesNotMatch(edge, /return contentRecord\.text;/);
});

test("تتحقق من حالة تفاعل Gemini وتتعامل مع النقص والميزانية", () => {
  assert.match(edge, /assertCompletedGeminiInteraction\(payload\)/);
  assert.match(edge, /incomplete:/);
  assert.match(edge, /budget_exceeded:/);
  assert.match(edge, /geminiModelOutputError/);
  assert.doesNotMatch(edge, /temperature:\s*0\.2/);
});

test("تعيد رمز تتبع آمن للواجهة وتسجل المراحل دون نص المصدر", () => {
  assert.match(edge, /createRequestId/);
  assert.match(edge, /request_received/);
  assert.match(edge, /gemini_request_started/);
  assert.match(edge, /gemini_response_received/);
  assert.match(edge, /requestId,/);
  assert.match(generator, /رمز التتبع/);
  assert.equal(pkg.version, "0.0.31");
});

test("تستخدم مستخرج JSON متوازن يحترم السلاسل النصية", () => {
  assert.match(edge, /extractFirstJsonObject/);
  assert.match(edge, /let inString = false/);
  assert.match(edge, /let escaped = false/);
  assert.match(edge, /stripMarkdownFence/);
});
