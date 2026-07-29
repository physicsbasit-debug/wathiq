import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const structure = await readFile(new URL("../src/source-structure.ts", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("لا تستدعي واجهة H3 مسودات الهيكل القديمة ولا تحذفها", () => {
  assert.doesNotMatch(app, /shouldQuarantineLegacyStructureDraft|لم يحذفها واثق|حذف واثق مسودة قديمة مشوهة تلقائيًا/);
  assert.match(structure, /shouldQuarantineLegacyStructureDraft/);
});

test("يحتفظ المحرك ببوابة التعرف على المسودات القديمة", () => {
  assert.match(structure, /shouldQuarantineLegacyStructureDraft/);
  assert.match(structure, /reviewStatus === "معتمد"/);
  assert.match(structure, /extractionMethod === "manual"/);
});

test("يحافظ إصدار واثق على Fix السابق وما بعده", () => {
  assert.ok(Number(packageJson.version.split(".")[2]) >= 16);
});
