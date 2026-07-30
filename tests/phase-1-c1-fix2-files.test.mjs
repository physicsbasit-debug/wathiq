import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");
const generator = await readFile(new URL("../src/question-generation.ts", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("يجعل الخادم مالك مواصفة الرسم بدل شراء الرسم من Gemini ثم رفضه", () => {
  assert.match(edge, /buildServerOwnedVisualSpec/);
  assert.match(edge, /fixedVisual/);
  assert.match(edge, /لا تنشئ visual ولا تعدله ولا تعيده في JSON/);
  assert.doesNotMatch(edge, /required: \["planItemId", "visual", "alternatives"\]/);
  assert.match(edge, /visual: buildServerOwnedVisualSpec\(requested, request\)/);
});

test("يضبط تكلفة التفكير وحجم الإخراج ويسجل بيانات الاستخدام", () => {
  assert.match(edge, /generationThinkingBudget/);
  assert.match(edge, /thinkingBudget: generationThinkingBudget\(request\.items\)/);
  assert.match(edge, /generationOutputTokenLimit/);
  assert.match(edge, /thoughtsTokenCount/);
  assert.match(edge, /cachedContentTokenCount/);
  assert.match(edge, /visualOwner: "server"/);
});

test("يحافظ على المسودات المكتملة ويرفع إصدار التطبيق فقط", () => {
  assert.match(pkg.version, /^0\.0\.(?:36|37|38)$/);
  assert.match(generator, /source-grounded-policy-ai-(?:9-visual-svg|10-strict-lesson-scope)/);
  assert.match(pkg.description, /تقليل استهلاك Gemini/);
});
