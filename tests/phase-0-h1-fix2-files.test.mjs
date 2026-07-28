import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const structure = await readFile(new URL("../src/source-structure.ts", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("تنظف الواجهة المسودة القديمة المشوهة من السجل المركزي عند التحميل", () => {
  assert.match(app, /shouldQuarantineLegacyStructureDraft/);
  assert.match(app, /replaceSourceStructure\(sourceId, \[\]\)/);
  assert.match(app, /حذف واثق مسودة قديمة مشوهة تلقائيًا/);
});

test("يستخدم المحرك بوابة عزل للمسودات القديمة فقط", () => {
  assert.match(structure, /shouldQuarantineLegacyStructureDraft/);
  assert.match(structure, /reviewStatus === "معتمد"/);
  assert.match(structure, /extractionMethod === "manual"/);
});

test("يحافظ إصدار واثق على Fix السابق وما بعده", () => {
  assert.ok(Number(packageJson.version.split(".")[2]) >= 16);
});
