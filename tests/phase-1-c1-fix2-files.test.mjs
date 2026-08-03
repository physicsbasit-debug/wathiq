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
  assert.match(edge, /const baseVisual = buildServerOwnedVisualSpec\(requested, request\)/);
  assert.match(edge, /hydrateVisualFromScientificItem/);
  assert.match(edge, /visual,/);
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
  assert.match(pkg.version, /^0\.0\.(?:36|37|38|39|40|41|42|43|44|45|46|47|48|49|50|51|52|53|54|55|56|57|58|59|60|61|62|63)$/);
  assert.match(generator, /source-grounded-policy-ai-(?:9-visual-svg|10-strict-lesson-scope|11-visual-enforced|12-advanced-visuals|13-trusted-enrichment|14-contextual-stimulus-alignment|15-controlled-hybrid-visuals|16-assessment-quality-context-diversity)/);
  assert.match(pkg.description, /تقليل استهلاك Gemini/);
});
