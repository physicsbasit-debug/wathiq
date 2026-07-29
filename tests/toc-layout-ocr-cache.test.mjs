import test from "node:test";
import assert from "node:assert/strict";
import { extractPositionalTocLayouts } from "../dist/assets/toc-layout-ocr.js";

const access = { url: "https://example.test/book.pdf", httpHeaders: { Authorization: "Bearer test" } };

function layout(pageNumber = 12) {
  return {
    pageNumber,
    width: 1200,
    height: 1700,
    words: [{ text: "المحتويات", xMin: 800, yMin: 40, xMax: 1000, yMax: 80, confidence: 0.98 }],
    provider: "google-cloud-vision-positional",
    processedAt: "2026-07-29T10:00:00.000Z",
  };
}

function pdfLoader({ getPage }) {
  return async () => ({
    GlobalWorkerOptions: { workerSrc: "" },
    getDocument() {
      return {
        promise: Promise.resolve({
          numPages: 124,
          getPage,
          cleanup() {},
          async destroy() {},
        }),
        async destroy() {},
      };
    },
  });
}

test("يستخدم كاش الفهرس قبل رسم الصفحة أو رفع صورتها", async () => {
  let loadPdfCalls = 0;
  let getPageCalls = 0;
  let renderCalls = 0;
  let sendCalls = 0;
  let cacheCalls = 0;

  const forbiddenPdfLoader = async () => {
    loadPdfCalls += 1;
    throw new Error("يجب ألا يُحمّل PDF عند اكتمال الكاش.");
  };

  const result = await extractPositionalTocLayouts(
    "source-cache",
    access,
    [12],
    async () => {
      sendCalls += 1;
      return layout();
    },
    async ({ sourceId, pageNumber }) => {
      cacheCalls += 1;
      assert.equal(sourceId, "source-cache");
      assert.equal(pageNumber, 12);
      return layout(12);
    },
    undefined,
    forbiddenPdfLoader,
    async () => {
      renderCalls += 1;
      return new Blob(["image"], { type: "image/jpeg" });
    },
  );

  assert.equal(result.length, 1);
  assert.equal(result[0]?.pageNumber, 12);
  assert.equal(cacheCalls, 1);
  assert.equal(loadPdfCalls, 0);
  assert.equal(getPageCalls, 0);
  assert.equal(renderCalls, 0);
  assert.equal(sendCalls, 0);
});

test("يرسم ويرفع الصفحة مرة واحدة فقط عند غياب الكاش", async () => {
  let getPageCalls = 0;
  let renderCalls = 0;
  let sendCalls = 0;
  let cleaned = false;

  const page = {
    getViewport() { return { width: 600, height: 800 }; },
    render() { return { promise: Promise.resolve() }; },
    cleanup() { cleaned = true; },
  };

  const result = await extractPositionalTocLayouts(
    "source-miss",
    access,
    [12],
    async ({ sourceId, pageNumber, totalPages, image }) => {
      sendCalls += 1;
      assert.equal(sourceId, "source-miss");
      assert.equal(pageNumber, 12);
      assert.equal(totalPages, 124);
      assert.equal(image.type, "image/jpeg");
      return layout(12);
    },
    async () => null,
    undefined,
    pdfLoader({
      async getPage(pageNumber) {
        getPageCalls += 1;
        assert.equal(pageNumber, 12);
        return page;
      },
    }),
    async (receivedPage) => {
      renderCalls += 1;
      assert.equal(receivedPage, page);
      return new Blob(["image"], { type: "image/jpeg" });
    },
  );

  assert.equal(result.length, 1);
  assert.equal(getPageCalls, 1);
  assert.equal(renderCalls, 1);
  assert.equal(sendCalls, 1);
  assert.equal(cleaned, true);
});
