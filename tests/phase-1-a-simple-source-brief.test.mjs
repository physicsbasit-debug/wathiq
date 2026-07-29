import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const domain = await readFile(new URL("../src/domain.ts", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("Phase 1-A replaces mock curriculum hierarchy with a simple topic field", () => {
  assert.match(app, /موضوع الاختبار أو اسم الدرس/);
  assert.match(app, /id="topic-input"/);
  assert.doesNotMatch(app, /id="unit-select"/);
  assert.doesNotMatch(app, /data-group="lesson"/);
  assert.doesNotMatch(app, /data-group="outcome"/);
});

test("Phase 1-A retrieves indexed chunks before continuing", () => {
  assert.match(app, /prepareSourceContext/);
  assert.match(app, /listSourceChunks/);
  assert.match(app, /rankSourceChunks/);
  assert.match(app, /لا يوجد مصدر مفهرس مطابق/);
});

test("Phase 1-A does not claim final scientific approval", () => {
  assert.doesNotMatch(app, /اعتماد النموذج أ/);
  assert.match(app, /لا يُدّعى اعتماد علمي/);
  assert.match(domain, /sourceReferenceId/);
  assert.equal(pkg.version, "0.0.25");
});
