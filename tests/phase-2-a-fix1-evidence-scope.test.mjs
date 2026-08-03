import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");

test("يقيد الخادم دليل كل مفردة بمقاطع مرجعها فقط دون تضخيم مخطط Gemini", () => {
  assert.match(edge, /generationSchema\(\s*request\.items,\s*evidenceCatalog,/s);
  assert.match(edge, /const evidence = evidenceCatalog\.byId\.get\(alternative\.sourceEvidenceId\.trim\(\)\)/);
  assert.match(edge, /evidence\.referenceId !== sourceReferenceId/);
  assert.doesNotMatch(edge, /enum: allowedEvidenceIds/);
});

test("يرفض الدليل المفقود أو التابع لمرجع آخر أثناء التحقق الخادمي", () => {
  assert.match(edge, /اختار مولد الأسئلة دليلًا لا ينتمي إلى مرجع المفردة/);
  assert.match(edge, /المرجع المختار لا يثبت ارتباط السؤال بالدرس المحدد/);
});
