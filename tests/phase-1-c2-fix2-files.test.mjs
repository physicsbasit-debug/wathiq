import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const catalog = await readFile(new URL("../src/lesson-catalog.ts", import.meta.url), "utf8");
const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("يستبدل الإدخال اليدوي بقائمة واحدة من فهرس المصدر", () => {
  assert.match(pkg.version, /^0\.0\.(?:38|39|40|41|42|43|44)$/);
  assert.match(app, /اختر دروس الاختبار/);
  assert.match(app, /data-lesson-option-id/);
  assert.doesNotMatch(app, /data-lesson-topic-index/);
  assert.doesNotMatch(app, /إضافة درس/);
  assert.match(css, /lesson-catalog-list/);
});

test("يبني قائمة الدروس من الهيكل أو من الفهرس النصي دون OCR جديد", () => {
  assert.match(app, /listSourceStructure/);
  assert.match(app, /extractSourceStructure/);
  assert.match(app, /listSourceChunks/);
  assert.match(app, /allowUnitHeadingFallback: false/);
  assert.match(catalog, /confidence < 0\.9/);
  assert.doesNotMatch(app, /toc-layout-ocr/);
});
