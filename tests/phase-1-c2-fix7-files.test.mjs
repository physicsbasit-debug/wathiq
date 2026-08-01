import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const exporter = await readFile(new URL("../src/exam-export.ts", import.meta.url), "utf8");
const generator = await readFile(new URL("../src/question-generation.ts", import.meta.url), "utf8");
const visual = await readFile(new URL("../src/question-visual.ts", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("يثبت Fix 7 الإصدار وعقد التوليد البصري الجديد", () => {
  assert.match(pkg.version, /^0\.0\.(?:44|45|46|47|48|49|50)$/);
  assert.match(generator, /source-grounded-policy-ai-(?:12-advanced-visuals|13-trusted-enrichment|14-contextual-stimulus-alignment|15-controlled-hybrid-visuals|16-assessment-quality-context-diversity)/);
  assert.match(generator, /electrostatic_diagram/);
  assert.match(edge, /السؤال البصري لا يعتمد صراحة على الشكل المرفق/);
  assert.match(edge, /fixedVisual\.type لا يساوي none/);
});

test("يزيل حروف أ ب ج د من بدائل الطالب ويكتفي بدوائر التظليل", () => {
  assert.doesNotMatch(app, /ARABIC_OPTION_LABELS/);
  assert.doesNotMatch(app, /paper-option-label/);
  assert.match(app, /paper-option-circle/);
  assert.match(app, /proposal-option-circle/);
  assert.match(styles, /proposal-option-circle/);
});

test("يصلح Word وPDF دون الاعتماد على نافذة منبثقة", () => {
  assert.match(exporter, /downloadBlob/);
  assert.match(exporter, /application\/msword/);
  assert.match(exporter, /document\.createElement\("iframe"\)/);
  assert.match(exporter, /frameWindow\.print\(\)/);
  assert.doesNotMatch(exporter, /window\.open\(/);
});

test("يدعم مخطط الكهرباء الساكنة في الواجهة والخادم والطباعة", () => {
  assert.match(visual, /renderElectrostaticDiagram/);
  assert.match(visual, /charge_transfer/);
  assert.match(visual, /electric_field/);
  assert.match(edge, /type: "electrostatic_diagram"/);
  assert.match(exporter, /qv-charged-object/);
});
