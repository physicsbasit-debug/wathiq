import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("يضيف SQL عمود الفصل الدراسي مع قيمة قديمة آمنة", async () => {
  const sql = await read("supabase/phase_0_g_fix3_semester_upload_finalization.sql");
  assert.match(sql, /add column if not exists semester/);
  assert.match(sql, /غير محدد/);
  assert.match(sql, /source_registry_semester_check/);
});

test("تمنع Edge Function إرسال extraction_status فارغًا", async () => {
  const edge = await read("supabase/functions/google-drive-oauth/index.ts");
  assert.match(edge, /extraction_status: source\.extractionStatus \?\? "لم يبدأ"/);
  assert.match(edge, /semester: source\.semester \?\? "غير محدد"/);
  assert.match(edge, /الفصل_الأول/);
});

test("تظهر الواجهة اختيار الفصل الدراسي", async () => {
  const app = await read("src/app.ts");
  assert.match(app, /source-semester/);
  assert.match(app, /SOURCE_SEMESTERS/);
});
