import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("يضيف SQL جدول صفحات OCR مع RLS", async () => {
  const sql = await read("supabase/phase_0_g_fix2b_arabic_ocr.sql");
  assert.match(sql, /create table if not exists public\.source_ocr_pages/);
  assert.match(sql, /primary key \(owner_id, source_id, page_number\)/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /owner reads own OCR pages/);
});

test("تضيف Edge Function مسار OCR وتستدعي Google Vision", async () => {
  const edge = await read("supabase/functions/google-drive-oauth/index.ts");
  assert.match(edge, /GOOGLE_CLOUD_VISION_API_KEY/);
  assert.match(edge, /route === "ocr-page"/);
  assert.match(edge, /DOCUMENT_TEXT_DETECTION/);
  assert.match(edge, /languageHints: \["ar", "en"\]/);
  assert.match(edge, /source_ocr_pages/);
});

test("تربط الواجهة OCR العربي وتدعم الاستكمال", async () => {
  const app = await read("src/app.ts");
  const ocr = await read("src/ocr-indexer.ts");
  assert.match(app, /extractPdfWithArabicOcr/);
  assert.match(app, /تشغيل OCR العربي/);
  assert.match(app, /listOcrPages/);
  assert.match(ocr, /تم العثور على OCR محفوظ/);
  assert.match(ocr, /MAX_OCR_PAGES = 300/);
});

test("لا يتغير pages.yml في Fix 2B", async () => {
  const pages = await read(".github/workflows/pages.yml");
  assert.doesNotMatch(pages, /VISION|OCR/);
});
