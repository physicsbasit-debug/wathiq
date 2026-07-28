import test from "node:test";
import assert from "node:assert/strict";
import {
  assessExtractedTextQuality,
  buildExtractionResult,
  detectDocumentLanguage,
  detectHeadingCandidates,
  extractPdfText,
  shouldInvalidateLegacyExtraction,
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


const readableArabic = `
الوحدة الأولى: المادة وخصائصها
تتكون المادة من جسيمات صغيرة، ويمكن للطالب أن يفسر تغير حالة المادة عند التسخين أو التبريد.
يوضح الشكل التالي حركة الجسيمات في الحالة الصلبة والسائلة والغازية.
اشرح سبب زيادة سرعة الجسيمات عند ارتفاع درجة الحرارة، ثم قارن بين ترتيب الجسيمات في الحالات الثلاث.
`.repeat(7);

const garbledArabic = `
استمارة زيارة إشرافية لمعلم مادة مجال المديرية العامة للإشراف التربوي
توصيف مجالات استمارة الزيارة التشرفية لمعلم م ادة مجال التوصيف امجلال هشا ساليبي امني سية ابي ساسيم بتأثير درملبي ل ساسيمثال تاسايبع ز افكي مالبيد قيا بي ساجيممل ساليبي بي ب ي سابي يند ليبا ساسيمالتفت قوربي بيع زبيو عييق عابي املا تكايت ترم تعميبي تسل ليمند ثمت ع بحعريزو عف برز تقيزت لا سبب تسل سالمدسريز ايبيلملات نيزبي عيب ستقيبي تسل سال ليمند بي يملذ تسابيع ملينت ب الي هذا اتنيل عييبي تسل ساسايبيا ايريا عتل سه تسل ساعرسغتماذ قاستي بمليند ساسسا يمل سبيع لت عتنيل ساسايبيا ساسايبي قافي ت ساسايات بيبي س بيبي عييب ت قسا عييب ايبيل سه برل سابارملامد عف ته ايج بي عغ ت ع تحلمولو ساهد بد ساسم يعلمعي سقايا ملخيف سه ف حملعي لا تفح درس سابي ت قتحصمليا
`.repeat(4);

test("تقبل بوابة الجودة النص العربي المقروء", () => {
  const quality = assessExtractedTextQuality(readableArabic);
  assert.equal(quality.accepted, true);
  assert.equal(quality.reason, "accepted");
  assert.ok(quality.score >= 70);
});

test("ترفض بوابة الجودة طبقة النص العربية المشوهة", () => {
  const quality = assessExtractedTextQuality(garbledArabic);
  assert.equal(quality.accepted, false);
  assert.equal(quality.reason, "garbled_arabic");
  assert.ok(quality.score <= 60);
  assert.equal(shouldInvalidateLegacyExtraction(garbledArabic), true);
});

test("لا تفهرس النص المشوه ولا تحفظ له معاينة أو عناوين", () => {
  const result = buildExtractionResult([garbledArabic, garbledArabic]);
  assert.equal(result.requiresOcr, true);
  assert.equal(result.quality.reason, "garbled_arabic");
  assert.equal(result.preview, "");
  assert.deepEqual(result.detectedHeadings, []);
  assert.deepEqual(result.chunks, []);
});

test("لا ترفض وثيقة سليمة بسبب صفحة واحدة رديئة", () => {
  const result = buildExtractionResult([garbledArabic, readableArabic, readableArabic, readableArabic]);
  assert.equal(result.requiresOcr, false);
  assert.equal(result.quality.accepted, true);
  assert.ok(result.chunks.length > 0);
});

test("ترفض وثيقة يغلب على صفحاتها النص المشوه حتى لو كان ملخصها العام مضللًا", () => {
  const result = buildExtractionResult([readableArabic, garbledArabic, garbledArabic, garbledArabic]);
  assert.equal(result.requiresOcr, true);
  assert.equal(result.quality.reason, "garbled_arabic");
  assert.ok(result.quality.score <= 50);
});
