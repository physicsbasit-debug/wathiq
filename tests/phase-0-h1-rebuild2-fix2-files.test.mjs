import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Fix 2 يفصل فحص الكاش GET عن رفع صورة POST", async () => {
  const [edge, drive, toc, app] = await Promise.all([
    read("supabase/functions/google-drive-oauth/index.ts"),
    read("src/google-drive.ts"),
    read("src/toc-layout-ocr.ts"),
    read("src/app.ts"),
  ]);

  assert.match(edge, /route === "ocr-layout-page" && req\.method === "GET"/);
  assert.match(edge, /handleOcrLayoutCache/);
  assert.match(edge, /cacheHit:\s*false/);
  assert.match(edge, /post_cache_hit_after_body/);

  const bodyRead = edge.indexOf("const bytes = await readOcrImageBytes(req, traceId);");
  const postCacheRead = edge.indexOf("const cachedLayout = await readCachedOcrLayout(ownerId, sourceId, pageNumber);", bodyRead);
  assert.ok(bodyRead >= 0, "يجب قراءة جسم POST.");
  assert.ok(postCacheRead > bodyRead, "يجب فحص كاش POST بعد استهلاك جسم الصورة.");

  assert.match(drive, /getCachedSourceLayoutPage/);
  assert.match(drive, /method:\s*"GET"/);
  assert.match(toc, /readCachedPage/);
  assert.match(toc, /if \(cached\)/);
  assert.match(app, /googleDriveService\.getCachedSourceLayoutPage/);
});

test("Fix 2 يحتفظ بإصلاح نوع معرفات Drive في Edge Function", async () => {
  const edge = await read("supabase/functions/google-drive-oauth/index.ts");
  assert.match(edge, /typeof row\.drive_file_id !== "string"/);
  assert.match(edge, /const driveFileId = row\.drive_file_id\.trim\(\)/);
  assert.match(edge, /typeof row\.drive_original_parent_folder_id !== "string"/);
  assert.match(edge, /const originalParentId = row\.drive_original_parent_folder_id\.trim\(\)/);
  assert.doesNotMatch(edge, /moveDriveFile\(accessToken, row\.drive_file_id/);
});


test("يرفع الإصدار إلى Fix 2", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  assert.equal(packageJson.version, "0.0.21");
});
