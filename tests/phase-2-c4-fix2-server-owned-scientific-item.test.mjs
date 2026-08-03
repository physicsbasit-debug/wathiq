import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ASSESSMENT_GENERATION_V2_VERSION } from "../dist/assets/assessment-generation-v2.js";

const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

function blockBetween(startToken, endToken) {
  const start = edge.indexOf(startToken);
  const end = edge.indexOf(endToken, start + startToken.length);
  return edge.slice(start, end);
}

test("يثبت إصدار C4 Fix 2 وعقد ai-21 المملوك للخادم", () => {
  assert.match(pkg.version, /^0\.0\.(?:61|62)$/);
  assert.match(ASSESSMENT_GENERATION_V2_VERSION, /source-grounded-policy-ai-(?:21-server-owned-scientific-item|22-server-owned-question-pattern|23-server-owned-assessment-contract|24-context-aware-moment-contract)/);
  assert.match(pkg.description, /ملكية النموذج العلمي بالكامل إلى خادم واثق/);
});

test("لا يطلب مخطط Gemini scientificItem ولا يشترطه في الاستجابة", () => {
  const schema = blockBetween("function generationSchema", "function parseGenerationRequest");
  assert.doesNotMatch(schema, /scientificItem\s*:/);
  assert.doesNotMatch(schema, /"scientificItem"/);
  assert.doesNotMatch(schema, /scenarioContract\s*:/);
});

test("يرسل الخادم serverScientificItem نفسه في التوليد الكامل والإصلاح الانتقائي", () => {
  assert.match(edge, /serverScientificItem = buildServerOwnedScientificItem/);
  assert.match(edge, /batchPlanItems:[\s\S]*serverScientificItem/);
  assert.match(edge, /scopedGenerationRequest/);
  assert.match(edge, /احتفظ بالخطة والدرس والدرجة وserverScientificItem كما هي/);
});

test("يستخدم hydrateGeneratedItem النموذج الخادمي حتى لمسودات ai-20 الحالية", () => {
  const hydrate = blockBetween("function hydrateGeneratedItem", "function validateGeneratedItemsIndividually");
  assert.match(hydrate, /source-grounded-policy-ai-20-unified-scientific-item/);
  assert.match(hydrate, /source-grounded-policy-ai-22-server-owned-question-pattern/);
  assert.match(hydrate, /source-grounded-policy-ai-(?:23-server-owned-assessment-contract|24-context-aware-moment-contract)/);
  assert.match(hydrate, /buildServerOwnedScientificItem\(requested, request, baseVisual\)/);
  assert.doesNotMatch(hydrate, /throw retryableError\("السؤال لا يحتوي نموذجًا علميًا موحدًا صالحًا/);
});

test("يبني الشحن بالدلك بشحنتين متعاكستين ويحسب القوة المحصلة خادميًا", () => {
  const builder = blockBetween("function buildServerOwnedScientificItem", "function generationSchema");
  assert.match(builder, /primaryCharge: "negative"/);
  assert.match(builder, /secondaryCharge: "positive"/);
  assert.match(builder, /const resultValue = Number\(Math\.hypot\(x, y\)\.toFixed\(2\)\)/);
  assert.match(builder, /resultDirection = resultantDirection\(x, y\)/);
});
