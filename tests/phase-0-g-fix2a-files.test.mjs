import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}

test("تربط الواجهة بوابة الجودة بإصلاح الفهرسة القديمة", async () => {
  const app = await read("src/app.ts");
  assert.match(app, /shouldInvalidateLegacyExtraction/);
  assert.match(app, /repairLegacyLowQualityExtractions/);
  assert.match(app, /invalidateLegacyExtraction/);
});

test("تحذف طبقة التخزين المقاطع القديمة قبل تحويل المصدر إلى OCR", async () => {
  const store = await read("src/central-source-store.ts");
  const method = store.slice(store.indexOf("async invalidateLegacyExtraction"), store.indexOf("private chunkToRow"));
  assert.match(method, /source_chunks/);
  assert.match(method, /method: "DELETE"/);
  assert.match(method, /extraction_status: "يحتاج OCR"/);
  assert.match(method, /extraction_preview: null/);
});
