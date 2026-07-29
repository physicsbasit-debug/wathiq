import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const structure = await readFile(new URL("../src/source-structure.ts", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("تعلن الواجهة فهرسة الصفحات بدل منشئ الفهرس", () => {
  assert.match(app, /Phase 0-H3/);
  assert.match(app, /فهرسة حسب الصفحات/);
  assert.doesNotMatch(app, /صفوف قابلة للمراجعة|Phase 0-H2/);
});

test("يبقى محرك H1 القديم متاحًا للتوافق ولا يقود مسار الواجهة", () => {
  assert.match(structure, /parseNumberedMultiColumnTocPage/);
  assert.match(structure, /NUMBERED_TOC_LESSON_PATTERN/);
  assert.doesNotMatch(app, /extractStructureFromPositionalToc/);
});

test("يرفع إصدار واثق بعد Fix 3", () => {
  assert.ok(Number(packageJson.version.split(".").at(-1)) >= 17);
});
