import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const edgePath = new URL("../supabase/functions/google-drive-oauth/index.ts", import.meta.url);
const sqlPath = new URL("../supabase/phase_0_g_pdf_extraction.sql", import.meta.url);
const appPath = new URL("../src/app.ts", import.meta.url);

test("تضيف Edge Function مسار تنزيل PDF الآمن مع دعم Range", async () => {
  const code = await readFile(edgePath, "utf8");
  assert.match(code, /route === "source-file"/);
  assert.match(code, /alt", "media"/);
  assert.match(code, /req\.headers\.get\("Range"\)/);
  assert.match(code, /Access-Control-Expose-Headers/);
});

test("ينشئ SQL حقول الاستخراج وجدول المقاطع مع RLS وفهرس بحث", async () => {
  const sql = await readFile(sqlPath, "utf8");
  for (const field of ["extraction_status", "extracted_page_count", "extraction_preview", "detected_headings"]) {
    assert.match(sql, new RegExp(field));
  }
  assert.match(sql, /create table if not exists public\.source_chunks/i);
  assert.match(sql, /to_tsvector\('simple'/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /foreign key \(owner_id, source_id\)/i);
});

test("تزيل الواجهة محاكاة الفهرسة وتستخدم الاستخراج الحقيقي", async () => {
  const code = await readFile(appPath, "utf8");
  assert.doesNotMatch(code, /محاكاة الفهرسة/);
  assert.match(code, /extractAndIndexSource/);
  assert.match(code, /extractPdfText/);
  assert.match(code, /يحتاج OCR/);
});
