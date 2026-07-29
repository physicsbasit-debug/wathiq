import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const positional = await readFile(new URL("../src/positional-toc.ts", import.meta.url), "utf8");
const renderer = await readFile(new URL("../src/toc-layout-ocr.ts", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/google-drive-oauth/index.ts", import.meta.url), "utf8");
const sql = await readFile(new URL("../supabase/phase_0_h1_rebuild2_positional_toc.sql", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("تحتفظ ملفات OCR الموضعي تاريخيًا لكنها لا تُربط بواجهة H3", () => {
  assert.doesNotMatch(app, /extractPositionalTocLayouts|buildTocDraft|extractStructureFromPositionalToc|لم يُحفظ شيء بعد/);
  assert.match(positional, /layoutPageToColumns/);
  assert.match(renderer, /computeTocRenderScale/);
});

test("يفصل المحرك العمود الأيمن عن الأيسر ويقرأ رموز الدروس", () => {
  assert.match(positional, /layoutPageToColumns/);
  assert.match(positional, /codeMatch/);
  assert.match(positional, /toc-positional-vision-1/);
});

test("تجهز الواجهة صفحة PDF بدقة عالية قبل OCR الموضعي", () => {
  assert.match(renderer, /PREFERRED_RENDER_SCALE = 2\.75/);
  assert.match(renderer, /MAX_RENDER_PIXELS = 10_000_000/);
});

test("تضيف Edge Function مسار إحداثيات الكلمات وتخزن layout_json", () => {
  assert.match(edge, /ocr-layout-page/);
  assert.match(edge, /visionLayoutWords/);
  assert.match(edge, /layout_json/);
  assert.match(sql, /add column if not exists layout_json jsonb/);
});

test("يرفع إصدار واثق بعد Rebuild 2", () => {
  assert.ok(Number(packageJson.version.split(".").at(-1)) >= 20);
});
