import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const structure = await readFile(new URL("../src/source-structure.ts", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("تعلن الواجهة دعم الفهرس متعدد الأعمدة", () => {
  assert.match(app, /Phase 0-H1 (?:Fix 3|Rebuild 1|Rebuild 2)/);
  assert.match(app, /فهرس موثوق متعدد الأعمدة/);
});

test("يستخدم المحرك ترقيم الوحدات والدروس بدل ترتيب OCR", () => {
  assert.match(structure, /parseNumberedMultiColumnTocPage/);
  assert.match(structure, /NUMBERED_TOC_LESSON_PATTERN/);
  assert.match(structure, /unitOrdinal/);
  assert.match(structure, /lessonOrdinal/);
});

test("يرفع إصدار واثق إلى Fix 3", () => {
  assert.ok(Number(packageJson.version.split(".").at(-1)) >= 17);
});
