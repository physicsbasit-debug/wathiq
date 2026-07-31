import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");
const generator = await readFile(new URL("../src/question-generation.ts", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("يستبدل الاقتباس الحر بمعرفات أدلة مرقمة يثبتها الخادم", () => {
  assert.match(edge, /interface EvidenceFragment/);
  assert.match(edge, /buildEvidenceCatalog/);
  assert.match(edge, /splitEvidenceFragments/);
  assert.match(edge, /sourceEvidenceId/);
  assert.match(edge, /allowedEvidenceIds/);
  assert.match(edge, /sourceSupport: evidence\.text/);
  assert.doesNotMatch(edge, /normalizedReference\.includes\(normalizedSupport\)/);
  assert.doesNotMatch(edge, /تعذر إثبات استناد أحد الأسئلة إلى نص المرجع حرفيًا/);
});

test("يتحقق أن الدليل المختار ينتمي إلى مرجع المفردة ولا يعطل الدفعة بسبب اختلاف الاقتباس", () => {
  assert.match(edge, /evidence\.referenceId !== sourceReferenceId/);
  assert.match(edge, /اختار مولد الأسئلة دليلًا لا ينتمي إلى مرجع المفردة/);
  assert.match(edge, /needsReview: alternative\.needsReview \|\| weakAffinity/);
  assert.match(edge, /evidence_catalog_ready/);
});

test("يبقي عقد الأدلة المرقمة داخل الإصدار الأسلوبي الأحدث", () => {
  assert.match(generator, /source-grounded-policy-ai-(?:9-visual-svg|10-strict-lesson-scope)/);
  assert.match(pkg.version, /^0\.0\.(?:34|35|36|37|38|39|40|41)$/);
});
