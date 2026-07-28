import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const structure = await readFile(new URL("../src/source-structure.ts", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("تعلن الواجهة إعادة البناء المرجعية", () => {
  assert.match(app, /Phase 0-H1 Rebuild 1/);
});

test("يعطل المحرك fallback تلقائيًا ويستخدم الإصدار المرجعي", () => {
  assert.match(structure, /toc-golden-4/);
  assert.match(structure, /allowUnitHeadingFallback === true/);
});

test("يرفع إصدار واثق إلى Rebuild 1", () => {
  assert.equal(packageJson.version, "0.0.18");
});
