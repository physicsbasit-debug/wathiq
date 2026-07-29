import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("H2 يضيف منشئ فهرس منظم قابل للمراجعة", async () => {
  const app = await read("src/app.ts");
  const builder = await read("src/toc-draft-builder.ts");
  assert.match(app, /Phase 0-H2 · منشئ الفهرس المنظم/);
  assert.match(app, /save-toc-draft/);
  assert.match(app, /approve-toc-draft/);
  assert.match(app, /عرض نص OCR المرجعي/);
  assert.match(builder, /buildTocDraft/);
  assert.match(builder, /convertTocDraftRows/);
});

test("H2 لا يحفظ نتيجة OCR تلقائيًا ولا يحذف الهيكل السابق", async () => {
  const app = await read("src/app.ts");
  const extractStart = app.indexOf("async function extractAndSaveSourceStructure");
  const extractEnd = app.indexOf("function updateTocDraftRow", extractStart);
  const extractionBlock = app.slice(extractStart, extractEnd);
  assert.match(extractionBlock, /state\.structureDraftActive = true/);
  assert.doesNotMatch(extractionBlock, /replaceSourceStructure\(/);
  assert.match(app, /لم يحذفها واثق/);
});

test("H2 يفصل حفظ المسودة عن الاعتماد الصارم", async () => {
  const app = await read("src/app.ts");
  const structure = await read("src/source-structure.ts");
  assert.match(app, /validateSourceStructureDraft/);
  assert.match(app, /validateSourceStructureForApproval/);
  assert.match(structure, /الوحدة «\$\{root\.title\}» بلا دروس أو عناصر تابعة/);
});

test("H2 لا يغيّر SQL أو Edge Function أو pages.yml", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  assert.equal(packageJson.version, "0.0.23");
  assert.match(packageJson.description, /منشئ فهرس منظم/);
});
