import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const edgePath = new URL("../supabase/functions/google-drive-oauth/index.ts", import.meta.url);
const sqlPath = new URL("../supabase/phase_0_f2_source_uploads.sql", import.meta.url);

test("تحتوي Edge Function على مسارات الرفع المتدرج والأرشفة والاستعادة", async () => {
  const code = await readFile(edgePath, "utf8");
  for (const route of ["prepare-upload", "upload-status", "upload-chunk", "cancel-upload", "archive-source", "restore-source"]) {
    assert.match(code, new RegExp(`route === \"${route}\"`));
  }
  assert.match(code, /uploadType=resumable/);
  assert.match(code, /Content-Range/);
  assert.match(code, /addParents/);
  assert.match(code, /removeParents/);
});

test("يضيف SQL بيانات Drive وجدول جلسات الرفع مع تفعيل RLS", async () => {
  const sql = await readFile(sqlPath, "utf8");
  for (const column of ["content_fingerprint", "drive_file_id", "drive_parent_folder_id", "drive_web_view_link", "upload_state", "uploaded_at"]) {
    assert.match(sql, new RegExp(column));
  }
  assert.match(sql, /create table if not exists public\.source_upload_sessions/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.source_upload_sessions from anon, authenticated/i);
});
