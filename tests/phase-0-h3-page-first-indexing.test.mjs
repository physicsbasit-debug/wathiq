import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("Phase 0-H3 retires visual TOC from the runtime UI", () => {
  assert.doesNotMatch(app, /تحليل الفهرس بصريًا/);
  assert.doesNotMatch(app, /فتح منشئ الفهرس/);
  assert.doesNotMatch(app, /صفحات الفهرس يدويًا/);
  assert.doesNotMatch(app, /data-action="extract-source-structure/);
  assert.doesNotMatch(app, /extractPositionalTocLayouts/);
  assert.doesNotMatch(app, /buildTocDraft/);
});

test("Phase 0-H3 presents page-first readiness", () => {
  assert.match(app, /Phase 0-H3 · فهرسة حسب الصفحات/);
  assert.match(app, /استرجاع حسب الصفحة والمقطع/);
  assert.match(app, /لا يحتاج المصدر إلى تحليل فهرس بصري/);
  assert.equal(pkg.version, "0.0.24");
});
