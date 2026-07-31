import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("يثبت Fix 5 عقد نقاط التصحيح الدقيق والإصدار الجديد", () => {
  assert.match(pkg.version, /^0\.0\.(?:41|42|43|44|45|46|47)$/);
  assert.match(edge, /prefixItems:\s*requestedItems\.map/);
  assert.match(edge, /minItems:\s*markCount/);
  assert.match(edge, /maxItems:\s*markCount/);
  assert.match(edge, /markScheme كمصفوفة نصية طولها يساوي marks تمامًا/);
});

test("يصلح نموذج التصحيح وحده بدل إعادة شراء السؤال والرسم والمصدر", () => {
  assert.match(edge, /repairGeneratedPayloadMarkSchemes/);
  assert.match(edge, /repair_mark_scheme_only/);
  assert.match(edge, /MARK_SCHEME_REPAIR_MAX_OUTPUT_TOKENS\s*=\s*900/);
  assert.match(edge, /thinkingConfig:\s*\{ thinkingBudget: 0 \}/);
  assert.match(edge, /mark_scheme_repair_completed/);
  assert.match(edge, /mark_scheme_repair_fallback_used/);
});

test("يحفظ السؤال عند تعذر الإصلاح ويعلّمه للمراجعة", () => {
  assert.match(edge, /alternative\.needsReview = true/);
  assert.match(edge, /buildFallbackMarkScheme/);
  assert.match(edge, /points\.length !== marks \|\| points\.some/);
});
