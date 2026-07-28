import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOcrExtractionResult,
  computeOcrRenderScale,
  extractPdfWithArabicOcr,
  normalizeOcrPage,
} from "../dist/assets/ocr-indexer.js";

const readableArabic = `
الوحدة الأولى: المادة وخصائصها
تتكون المادة من جسيمات صغيرة، ويمكن للطالب أن يفسر تغير حالة المادة عند التسخين أو التبريد.
يوضح الشكل التالي حركة الجسيمات في الحالة الصلبة والسائلة والغازية.
اشرح سبب زيادة سرعة الجسيمات عند ارتفاع درجة الحرارة، ثم قارن بين ترتيب الجسيمات في الحالات الثلاث.
`.repeat(7);

test("يخفض دقة الرسم عندما تتجاوز الصفحة حد البكسلات", () => {
  assert.equal(computeOcrRenderScale(1000, 1000), 2);
  assert.ok(computeOcrRenderScale(4000, 4000) < 1.1);
});

test("ينظف نص صفحة OCR ويعيد حساب عدد الحروف", () => {
  const page = normalizeOcrPage({
    pageNumber: 1,
    content: "  الوحدة   الأولى\n\n\n المادة  ",
    characterCount: 999,
    confidence: 0.9,
    provider: "google-cloud-vision",
    processedAt: "2026-07-28T10:00:00.000Z",
  });
  assert.equal(page.content, "الوحدة الأولى\n\nالمادة");
  assert.equal(page.characterCount, page.content.length);
});

test("يبني نتيجة OCR عربية قابلة للفهرسة", () => {
  const result = buildOcrExtractionResult([
    { pageNumber: 1, content: readableArabic, characterCount: readableArabic.length, confidence: 0.94, provider: "google-cloud-vision", processedAt: "2026-07-28T10:00:00.000Z" },
    { pageNumber: 2, content: readableArabic, characterCount: readableArabic.length, confidence: 0.92, provider: "google-cloud-vision", processedAt: "2026-07-28T10:00:01.000Z" },
  ]);
  assert.equal(result.method, "google-vision-ocr");
  assert.equal(result.requiresOcr, false);
  assert.ok(result.chunks.length >= 2);
});

test("يستكمل OCR من الصفحات المحفوظة ولا يعيد إرسالها", async () => {
  const sent = [];
  const progress = [];
  const mockPdfJs = {
    GlobalWorkerOptions: { workerSrc: "" },
    getDocument() {
      return {
        promise: Promise.resolve({
          numPages: 3,
          async getPage(pageNumber) { return { pageNumber, cleanup() {} }; },
          cleanup() {},
          async destroy() {},
        }),
        async destroy() {},
      };
    },
  };
  const existing = [{
    pageNumber: 1,
    content: readableArabic,
    characterCount: readableArabic.length,
    confidence: 0.91,
    provider: "google-cloud-vision",
    processedAt: "2026-07-28T10:00:00.000Z",
  }];
  const result = await extractPdfWithArabicOcr(
    "source-1",
    { url: "https://example.test/source.pdf", httpHeaders: { Authorization: "Bearer test" } },
    existing,
    async ({ pageNumber }) => {
      sent.push(pageNumber);
      return {
        pageNumber,
        content: readableArabic,
        characterCount: readableArabic.length,
        confidence: 0.9,
        provider: "google-cloud-vision",
        processedAt: `2026-07-28T10:00:0${pageNumber}.000Z`,
      };
    },
    (value) => progress.push(value),
    async () => mockPdfJs,
    async () => new Blob(["image"], { type: "image/jpeg" }),
  );
  assert.deepEqual(sent, [2, 3]);
  assert.equal(result.pageCount, 3);
  assert.equal(result.requiresOcr, false);
  assert.ok(progress.some((item) => item.message.includes("محفوظ")));
});
