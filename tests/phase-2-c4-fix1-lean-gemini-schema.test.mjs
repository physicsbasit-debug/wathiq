import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("يحافظ C4 Fix 2 على مخطط النقل الخفيف مع ملكية الخادم", () => {
  assert.match(pkg.version, /^0\.0\.(?:61|62)$/);
  assert.match(pkg.description, /مخطط النقل.*خفيف/);
});

test("لا يرسل قيود tuple أو حدود ديناميكية داخل مخطط توليد الاختبار", () => {
  const start = edge.indexOf("function generationSchema");
  const end = edge.indexOf("function parseGenerationRequest", start);
  const schemaSource = edge.slice(start, end);
  assert.doesNotMatch(schemaSource, /prefixItems/);
  assert.doesNotMatch(schemaSource, /minItems/);
  assert.doesNotMatch(schemaSource, /maxItems/);
  assert.doesNotMatch(schemaSource, /minimum/);
  assert.doesNotMatch(schemaSource, /maximum/);
  assert.doesNotMatch(schemaSource, /format:/);
});

test("يبقي التحقق الدقيق في الخادم بدل تفويضه إلى Gemini", () => {
  for (const symbol of [
    "validateGeneratedItemsIndividually",
    "buildServerOwnedScientificItem",
    "validateScientificItemConsistency",
    "validateStructuredScenarioContract",
    "hasExactMarkScheme",
  ]) assert.match(edge, new RegExp(symbol));
});
