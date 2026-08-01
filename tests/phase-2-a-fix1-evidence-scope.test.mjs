import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");

test("يقيد مخطط JSON دليل كل مفردة بمقاطع مرجعها فقط", () => {
  assert.match(edge, /generationSchema\(\s*request\.items,\s*evidenceCatalog,/s);
  assert.match(edge, /function generationSchema\(requestedItems: GenerationItem\[\], evidenceSource: EvidenceCatalog \| string\[\],/);
  assert.match(edge, /evidenceSource\.byReferenceId\.get\(requestedItem\.sourceReferenceId\)/);
  assert.match(edge, /enum: allowedEvidenceIds/);
  assert.doesNotMatch(edge, /responseJsonSchema: generationSchema\([\s\S]{0,180}evidenceCatalog\.fragments\.map/);
});

test("يفشل مبكرًا إذا لم توجد مقاطع مرتبطة بمرجع المفردة", () => {
  assert.match(edge, /لا توجد مقاطع دليل مرتبطة بمرجع إحدى مفردات الاختبار/);
});
