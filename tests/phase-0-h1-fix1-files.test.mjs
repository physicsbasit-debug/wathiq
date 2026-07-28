import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const structure = await readFile(new URL("../src/source-structure.ts", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("تضيف الواجهة تحديد صفحات الفهرس يدويًا", () => {
  assert.match(app, /صفحات الفهرس يدويًا/);
  assert.match(app, /extract-source-structure-manual/);
  assert.match(app, /parsePageSelection/);
});

test("يلغي المحرك تصنيف السطر الرقمي العام كوحدة", () => {
  assert.doesNotMatch(structure, /NUMBERED_UNIT_PATTERN/);
  assert.match(structure, /looksLikeFormulaOrNoise/);
  assert.match(structure, /لم يُعثر على فهرس موثوق/);
});

test("يحافظ إصدار واثق على Fix السابق وما بعده", () => {
  assert.ok(Number(packageJson.version.split(".")[2]) >= 15);
});
