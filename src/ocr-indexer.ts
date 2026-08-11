import { buildExtractionResult, normalizeExtractedText } from "./pdf-indexer.js";
import type { SourceExtractionResult, SourceOcrPage } from "./types.js";

const PDFJS_VERSION = "4.10.38";
const PDFJS_BASE_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build`;
const PDFJS_MODULE_URL = `${PDFJS_BASE_URL}/pdf.mjs`;
const PDFJS_WORKER_URL = `${PDFJS_BASE_URL}/pdf.worker.mjs`;
const DEFAULT_RENDER_SCALE = 2;
const MAX_RENDER_PIXELS = 12_000_000;
const MAX_OCR_PAGES = 300;
const JPEG_QUALITY = 0.88;

interface PdfViewportLike {
  width: number;
  height: number;
}

interface PdfRenderTaskLike {
  promise: Promise<void>;
}

interface PdfOcrPageLike {
  getViewport(options: { scale: number }): PdfViewportLike;
  render(options: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewportLike; background?: string }): PdfRenderTaskLike;
  cleanup?(): void;
}

interface PdfOcrDocumentLike {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfOcrPageLike>;
  cleanup?(): void;
  destroy?(): Promise<void> | void;
}

interface PdfOcrLoadingTaskLike {
  promise: Promise<PdfOcrDocumentLike>;
  destroy?(): Promise<void> | void;
}

interface PdfJsOcrLike {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(options: Record<string, unknown>): PdfOcrLoadingTaskLike;
}

export interface OcrPdfAccess {
  url: string;
  httpHeaders: Record<string, string>;
}

export type OcrPdfInput = OcrPdfAccess | File;

export interface OcrProgress {
  pageNumber: number;
  totalPages: number;
  completedPages: number;
  percent: number;
  message: string;
}

export interface OcrPageRequest {
  sourceId: string;
  pageNumber: number;
  totalPages: number;
  image: Blob;
}

export type OcrPageSender = (request: OcrPageRequest) => Promise<SourceOcrPage>;
type PdfJsOcrLoader = () => Promise<PdfJsOcrLike>;
type OcrPageRenderer = (page: PdfOcrPageLike) => Promise<Blob>;

async function defaultPdfJsOcrLoader(): Promise<PdfJsOcrLike> {
  try {
    const loaded = await import(PDFJS_MODULE_URL) as unknown as PdfJsOcrLike;
    loaded.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    return loaded;
  } catch {
    const fallbackBase = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build`;
    const loaded = await import(`${fallbackBase}/pdf.mjs`) as unknown as PdfJsOcrLike;
    loaded.GlobalWorkerOptions.workerSrc = `${fallbackBase}/pdf.worker.mjs`;
    return loaded;
  }
}

export function computeOcrRenderScale(width: number, height: number, preferredScale = DEFAULT_RENDER_SCALE): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1;
  const preferredPixels = width * height * preferredScale * preferredScale;
  if (preferredPixels <= MAX_RENDER_PIXELS) return preferredScale;
  return Math.max(1, Math.sqrt(MAX_RENDER_PIXELS / (width * height)));
}

export function normalizeOcrPage(page: SourceOcrPage): SourceOcrPage {
  const content = normalizeExtractedText(page.content);
  return {
    ...page,
    content,
    characterCount: content.length,
  };
}

export function buildOcrExtractionResult(pages: SourceOcrPage[]): SourceExtractionResult {
  const ordered = [...pages]
    .map(normalizeOcrPage)
    .sort((a, b) => a.pageNumber - b.pageNumber);
  const result = buildExtractionResult(ordered.map((page) => page.content));
  return {
    ...result,
    method: "gemini-ocr",
  };
}

async function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error("تعذر تجهيز صورة الصفحة لخدمة OCR.");
  return blob;
}

async function renderPageToJpeg(page: PdfOcrPageLike): Promise<Blob> {
  const base = page.getViewport({ scale: 1 });
  const scale = computeOcrRenderScale(base.width, base.height);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("تعذر إنشاء مساحة رسم صفحة PDF.");
  await page.render({ canvasContext: context, viewport, background: "#ffffff" }).promise;
  const blob = await canvasToJpeg(canvas);
  canvas.width = 1;
  canvas.height = 1;
  return blob;
}

export async function extractPdfWithArabicOcr(
  sourceId: string,
  input: OcrPdfInput,
  existingPages: SourceOcrPage[],
  sendPage: OcrPageSender,
  onProgress?: (progress: OcrProgress) => void,
  loadPdfJs: PdfJsOcrLoader = defaultPdfJsOcrLoader,
  renderPage: OcrPageRenderer = renderPageToJpeg,
): Promise<SourceExtractionResult> {
  const pdfjs = await loadPdfJs();
  const loadingOptions = input instanceof File
    ? {
        data: new Uint8Array(await input.arrayBuffer()),
        disableAutoFetch: false,
        disableStream: false,
        isEvalSupported: false,
      }
    : {
        url: input.url,
        httpHeaders: input.httpHeaders,
        withCredentials: false,
        rangeChunkSize: 1024 * 1024,
        disableAutoFetch: false,
        disableStream: false,
        isEvalSupported: false,
      };
  const loadingTask = pdfjs.getDocument(loadingOptions);
  const document = await loadingTask.promise;
  if (!Number.isSafeInteger(document.numPages) || document.numPages <= 0) {
    throw new Error("ملف PDF لا يحتوي صفحات قابلة للمعالجة عبر OCR.");
  }
  if (document.numPages > MAX_OCR_PAGES) {
    throw new Error(`عدد صفحات الملف ${document.numPages} يتجاوز الحد الآمن ${MAX_OCR_PAGES} صفحة في عملية OCR واحدة.`);
  }

  const byPage = new Map<number, SourceOcrPage>();
  for (const page of existingPages) {
    if (page.pageNumber >= 1 && page.pageNumber <= document.numPages) {
      byPage.set(page.pageNumber, normalizeOcrPage(page));
    }
  }

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      if (byPage.has(pageNumber)) {
        onProgress?.({
          pageNumber,
          totalPages: document.numPages,
          completedPages: byPage.size,
          percent: Math.max(1, Math.round((byPage.size / document.numPages) * 94)),
          message: `تم العثور على OCR محفوظ للصفحة ${pageNumber}؛ جارٍ الاستكمال…`,
        });
        continue;
      }

      onProgress?.({
        pageNumber,
        totalPages: document.numPages,
        completedPages: byPage.size,
        percent: Math.max(1, Math.round((byPage.size / document.numPages) * 90)),
        message: `جارٍ تجهيز الصفحة ${pageNumber} من ${document.numPages} للقراءة العربية…`,
      });
      const page = await document.getPage(pageNumber);
      const image = await renderPage(page);
      const recognized = normalizeOcrPage(await sendPage({
        sourceId,
        pageNumber,
        totalPages: document.numPages,
        image,
      }));
      byPage.set(pageNumber, recognized);
      page.cleanup?.();
      onProgress?.({
        pageNumber,
        totalPages: document.numPages,
        completedPages: byPage.size,
        percent: Math.max(1, Math.round((byPage.size / document.numPages) * 94)),
        message: `تمت قراءة الصفحة ${pageNumber} من ${document.numPages} عبر OCR العربي.`,
      });
    }

    const pages = Array.from({ length: document.numPages }, (_, index) => byPage.get(index + 1) ?? {
      pageNumber: index + 1,
      content: "",
      characterCount: 0,
      confidence: null,
      provider: "gemini-ocr",
      processedAt: new Date().toISOString(),
    });
    onProgress?.({
      pageNumber: document.numPages,
      totalPages: document.numPages,
      completedPages: byPage.size,
      percent: 96,
      message: "جارٍ فحص جودة نص OCR وتجهيزه للفهرسة…",
    });
    return buildOcrExtractionResult(pages);
  } finally {
    document.cleanup?.();
    await document.destroy?.();
    await loadingTask.destroy?.();
  }
}
