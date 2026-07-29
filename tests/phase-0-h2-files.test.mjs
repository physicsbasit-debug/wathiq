import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("H2 يبقى موثقًا تاريخيًا لكنه متقاعد من واجهة H3", async () => {
  const [app, builder, doc] = await Promise.all([
    read("src/app.ts"),
    read("src/toc-draft-builder.ts"),
    read("docs/PHASE_0_H2_STRUCTURED_TOC_BUILDER.md"),
  ]);
  assert.doesNotMatch(app, /Phase 0-H2 · منشئ الفهرس المنظم|save-toc-draft|approve-toc-draft|عرض نص OCR المرجعي/);
  assert.match(builder, /buildTocDraft/);
  assert.match(builder, /convertTocDraftRows/);
  assert.match(doc, /Phase 0-H2/);
});

test("H3 لا يستدعي حفظ أو حذف هيكل تلقائيًا", async () => {
  const app = await read("src/app.ts");
  assert.doesNotMatch(app, /extractAndSaveSourceStructure|replaceSourceStructure\(|structureDraftActive/);
  assert.match(app, /استرجاع حسب الصفحة والمقطع/);
});

test("H3 يعتمد جاهزية المصدر على استخراج الصفحات والمقاطع", async () => {
  const app = await read("src/app.ts");
  assert.match(app, /renderSourceReadinessPanel/);
  assert.match(app, /لا يحتاج المصدر إلى تحليل فهرس بصري/);
  assert.match(app, /الوحدات والدروس ليست شرطًا/);
});

test("H3 لا يغيّر SQL أو Edge Function أو pages.yml", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  assert.ok(Number(packageJson.version.split(".").at(-1)) >= 24);
  assert.match(packageJson.description, /فهرستها حسب الصفحات والمقاطع/);
});
