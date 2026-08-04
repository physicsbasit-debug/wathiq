import { assertWathiqPatchAtLeast } from "./version-assertions.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const storage = await readFile(new URL("../src/storage.ts", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("يثبت إصدار Phase 2-A", () => {
  assertWathiqPatchAtLeast(pkg.version, 51);
});

test("يبقي عقود V2 التاريخية للتوافق ولا يعرضها كخيار إنتاجي بعد D4", () => {
  assert.match(storage, /whole_exam_v2/);
  assert.match(storage, /legacy_items/);
  assert.match(app, /progressive_items_v1/);
  assert.match(app, /التوليد التدريجي الدائم/);
  assert.doesNotMatch(app, /generation-mode-option/);
  assert.doesNotMatch(app, /state\.draft\.generationMode = "legacy_items"/);
  assert.match(styles, /\.generation-mode-panel/);
});

test("يحفظ وضع المحرك في المسودة ويرقي المسودات السابقة بأمان", () => {
  assert.match(storage, /generationMode/);
  assert.match(storage, /ASSESSMENT_GENERATION_V2_VERSION/);
  assert.match(storage, /legacy_items/);
});

test("تدعم Edge Function طلب generate_exam_v2 ومراجعة الاختبار كاملًا", () => {
  assert.match(edge, /generate_exam_v2/);
  assert.match(edge, /MAX_WHOLE_EXAM_ITEMS = 12/);
  assert.match(edge, /validateWholeExamGeneratedDiversity/);
  assert.match(edge, /whole-exam-blueprint-v1/);
  assert.match(edge, /سؤال نهائي واحد/);
});
