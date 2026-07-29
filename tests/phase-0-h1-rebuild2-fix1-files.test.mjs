import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { computeTocRenderScale } from "../dist/assets/toc-layout-ocr.js";
import { LAYOUT_OCR_REQUEST_TIMEOUT_MS } from "../dist/assets/google-drive.js";

const edge = await readFile(new URL("../supabase/functions/google-drive-oauth/index.ts", import.meta.url), "utf8");
const renderer = await readFile(new URL("../src/toc-layout-ocr.ts", import.meta.url), "utf8");
const drive = await readFile(new URL("../src/google-drive.ts", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("يضيف مهلة وإعادة محاولة لطلب Google Vision", () => {
  assert.match(edge, /VISION_REQUEST_TIMEOUT_MS = 40_000/);
  assert.match(edge, /VISION_REQUEST_ATTEMPTS = 2/);
  assert.match(edge, /vision_request_timeout/);
  assert.match(edge, /requestVisionLayout/);
});

test("يقرأ جسم الصورة بمهلة ويسجل مراحل الطلب", () => {
  assert.match(edge, /OCR_BODY_READ_TIMEOUT_MS = 20_000/);
  assert.match(edge, /readOcrImageBytes/);
  assert.match(edge, /request_body_read/);
  assert.match(edge, /layout_saved/);
});

test("يقبل ذاكرة التخزين المؤقت للإصدارين 1 و2", () => {
  assert.match(edge, /record\.version === 1 \|\| record\.version === 2/);
});

test("يوقف المتصفح الطلب العالق قبل بقاء الواجهة معلقة", () => {
  assert.equal(LAYOUT_OCR_REQUEST_TIMEOUT_MS, 110_000);
  assert.match(drive, /AbortController/);
  assert.match(drive, /لن تبقى الصفحة معلقة/);
});

test("يخفض حجم صورة الفهرس مع إبقاء دقة كافية", () => {
  assert.equal(computeTocRenderScale(595, 842), 2.75);
  assert.match(renderer, /JPEG_QUALITY = 0\.88/);
  assert.match(renderer, /MAX_RENDER_PIXELS = 10_000_000/);
});

test("يرفع الإصدار إلى Fix 1", () => {
  assert.equal(packageJson.version, "0.0.20");
});
