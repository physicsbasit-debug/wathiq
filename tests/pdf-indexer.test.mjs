import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExtractionResult,
  detectDocumentLanguage,
  detectHeadingCandidates,
  extractPdfText,
  splitTextIntoChunks,
  textItemsToPageText,
} from "../dist/assets/pdf-indexer.js";

test("يحوّل عناصر PDF إلى نص منظم مع فواصل الأسطر", () => {
  const text = textItemsToPageText([
    { str: "الوحدة الأولى", hasEOL: true },
    { str: "الطاقة", hasEOL: false },
    { str: "والشغل", hasEOL: true },
  ]);
  assert.equal(text, "الوحدة الأولى\nالطاقة والشغل");
});

test("يكشف لغة النص العربية والإنجليزية والمختلطة", () => {
  assert.equal(detectDocumentLanguage("هذا نص عربي طويل يشرح مفاهيم الطاقة والحركة والقوة في العلوم"), "العربية");
  assert.equal(detectDocumentLanguage("This English science text explains energy motion force and matter clearly"), "الإنجليزية");
  assert.equal(detectDocumentLanguage("الطاقة Energy والحركة Motion والقوة Force والمادة Matter"), "مختلط");
});

test("يستخرج عناوين مرشحة دون اعتمادها كوحدات رسمية", () => {
  const headings = detectHeadingCandidates([
    "الوحدة الأولى: الطاقة\nنص عادي\nالدرس 1: الشغل",
    "Learning Outcomes\nUnit 2: Motion\nنص إضافي",
  ]);
  assert.deepEqual(headings, ["الوحدة الأولى: الطاقة", "الدرس 1: الشغل", "Learning Outcomes", "Unit 2: Motion"]);
});

test("يقسم النص إلى مقاطع مرتبة مع حفظ رقم الصفحة", () => {
  const chunks = splitTextIntoChunks(["أ".repeat(1300), "ب".repeat(900)], 600, 60);
  assert.ok(chunks.length >= 4);
  assert.equal(chunks[0].pageFrom, 1);
  assert.equal(chunks.at(-1).pageFrom, 2);
  assert.deepEqual(chunks.map((chunk) => chunk.chunkIndex), chunks.map((_, index) => index));
});

test("يميز الملف المصور الذي يحتاج OCR", () => {
  const result = buildExtractionResult(["", "  ", "صورة"]);
  assert.equal(result.requiresOcr, true);
  assert.equal(result.chunks.length, 0);
});

test("يبني نتيجة قابلة للفهرسة لملف نصي", () => {
  const result = buildExtractionResult([
    "الوحدة الأولى: المادة\n" + "تشرح هذه الصفحة حالات المادة وخصائصها. ".repeat(20),
    "الدرس الثاني: التغيرات\n" + "تشرح هذه الصفحة التغيرات الفيزيائية والكيميائية. ".repeat(20),
  ]);
  assert.equal(result.requiresOcr, false);
  assert.equal(result.pageCount, 2);
  assert.ok(result.characterCount > 500);
  assert.ok(result.chunks.length >= 2);
  assert.match(result.detectedHeadings[0], /الوحدة/);
});

test("يقرأ PDF عبر محرك وهمي ويرسل تقدم الصفحات", async () => {
  const progress = [];
  const mockPdfJs = {
    GlobalWorkerOptions: { workerSrc: "" },
    getDocument(options) {
      assert.equal(options.url, "https://example.test/source-file");
      assert.equal(options.httpHeaders.Authorization, "Bearer token");
      return {
        promise: Promise.resolve({
          numPages: 2,
          async getPage(pageNumber) {
            return {
              async getTextContent() {
                return {
                  items: pageNumber === 1
                    ? [{ str: "الوحدة الأولى", hasEOL: true }, { str: "نص علمي ".repeat(40), hasEOL: true }]
                    : [{ str: "الدرس الثاني", hasEOL: true }, { str: "شرح إضافي ".repeat(40), hasEOL: true }],
                };
              },
              cleanup() {},
            };
          },
          cleanup() {},
          async destroy() {},
        }),
        async destroy() {},
      };
    },
  };
  const result = await extractPdfText(
    { url: "https://example.test/source-file", httpHeaders: { Authorization: "Bearer token" } },
    (value) => progress.push(value),
    async () => mockPdfJs,
  );
  assert.equal(result.pageCount, 2);
  assert.equal(result.requiresOcr, false);
  assert.ok(progress.some((value) => value.pageNumber === 2));
  assert.equal(progress.at(-1).percent, 94);
});
