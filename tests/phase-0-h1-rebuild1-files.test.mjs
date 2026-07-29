import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const structure = await readFile(new URL("../src/source-structure.ts", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("تعلن الواجهة مرحلة H3 وتبقي ملفات التوافق السابقة خارج التشغيل", () => {
  assert.match(app, /Phase 0-H3/);
  assert.doesNotMatch(app, /Phase 0-H2/);
});

test("يبقى fallback القديم معطلًا افتراضيًا", () => {
  assert.match(structure, /toc-golden-4/);
  assert.match(structure, /allowUnitHeadingFallback === true/);
});

test("يرفع إصدار واثق بعد Rebuild 1", () => {
  assert.ok(Number(packageJson.version.split(".").at(-1)) >= 18);
});
