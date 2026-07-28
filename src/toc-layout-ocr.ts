import type { SourceOcrLayoutPage } from "./types.js";

const PDFJS_VERSION = "4.10.38";
const PDFJS_BASE_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build`;
const PDFJS_MODULE_URL = `${PDFJS_BASE_URL}/pdf.mjs`;
const PDFJS_WORKER_URL = `${PDFJS_BASE_URL}/pdf.worker.mjs`;
const PREFERRED_RENDER_SCALE = 3;
const MAX_RENDER_PIXELS = 16_000_000;
const JPEG_QUALITY = 0.94;

interface PdfViewportLike {
  width: number;
  height: number;
}

interface PdfRenderTaskLike {
  promise: Promise<void>;
}

interface PdfPageLike {
  getViewport(options: { scale: number }): PdfViewportLike;
  render(options: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewportLike; background?: string }): PdfRenderTaskLike;
  cleanup?(): void;
}

interface PdfDocumentLike {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageLike>;
  cleanup?(): void;
  destroy?(): Promise<void> | void;
}

interface PdfLoadingTaskLike {
  promise: Promise<PdfDocumentLike>;
  destroy?(): Promise<void> | void;
}

interface PdfJsLike {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(options: Record<string, unknown>): PdfLoadingTaskLike;
}

export interface TocPdfAccess {
  url: string;
  httpHeaders: Record<string, string>;
}

export interface TocLayoutProgress {
  pageNumber: number;
  totalSelected: number;
  completed: number;
  message: string;
}

export interface TocLayoutPageRequest {
  sourceId: string;
  pageNumber: number;
  totalPages: number;
  image: Blob;
}

export type TocLayoutPageSender = (request: TocLayoutPageRequest) => Promise<SourceOcrLayoutPage>;
type PdfJsLoader = () => Promise<PdfJsLike>;
type PageRenderer = (page: PdfPageLike) => Promise<Blob>;

async function defaultPdfJsLoader(): Promise<PdfJsLike> {
  try {
    const loaded = await import(PDFJS_MODULE_URL) as unknown as PdfJsLike;
    loaded.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    return loaded;
  } catch {
    const fallbackBase = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build`;
    const loaded = await import(`${fallbackBase}/pdf.mjs`) as unknown as PdfJsLike;
    loaded.GlobalWorkerOptions.workerSrc = `${fallbackBase}/pdf.worker.mjs`;
    return loaded;
  }
}

export function computeTocRenderScale(width: number, height: number, preferredScale = PREFERRED_RENDER_SCALE): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1;
  const preferredPixels = width * height * preferredScale * preferredScale;
  if (preferredPixels <= MAX_RENDER_PIXELS) return preferredScale;
  return Math.max(1.25, Math.sqrt(MAX_RENDER_PIXELS / (width * height)));
}

async function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error("تعذر تجهيز صورة صفحة الفهرس للتحليل البصري.");
  return blob;
}

async function renderPageToJpeg(page: PdfPageLike): Promise<Blob> {
  const base = page.getViewport({ scale: 1 });
  const scale = computeTocRenderScale(base.width, base.height);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("تعذر إنشاء مساحة رسم صفحة الفهرس.");
  await page.render({ canvasContext: context, viewport, background: "#ffffff" }).promise;
  const blob = await canvasToJpeg(canvas);
  canvas.width = 1;
  canvas.height = 1;
  return blob;
}

export async function extractPositionalTocLayouts(
  sourceId: string,
  access: TocPdfAccess,
  selectedPages: number[],
  sendPage: TocLayoutPageSender,
  onProgress?: (progress: TocLayoutProgress) => void,
  loadPdfJs: PdfJsLoader = defaultPdfJsLoader,
  renderPage: PageRenderer = renderPageToJpeg,
): Promise<SourceOcrLayoutPage[]> {
  const uniquePages = [...new Set(selectedPages)].filter((page) => Number.isSafeInteger(page) && page > 0).sort((a, b) => a - b);
  if (!uniquePages.length) throw new Error("لم تُحدَّد صفحات فهرس صالحة للتحليل البصري.");
  if (uniquePages.length > 4) throw new Error("يمكن تحليل أربع صفحات فهرس كحد أقصى في العملية الواحدة.");

  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({
    url: access.url,
    httpHeaders: access.httpHeaders,
    withCredentials: false,
    rangeChunkSize: 1024 * 1024,
    disableAutoFetch: false,
    disableStream: false,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;
  try {
    if (!Number.isSafeInteger(pdf.numPages) || pdf.numPages <= 0) throw new Error("ملف PDF لا يحتوي صفحات قابلة للتحليل.");
    if (uniquePages.some((page) => page > pdf.numPages)) throw new Error("رقم صفحة الفهرس يتجاوز عدد صفحات الملف.");
    const layouts: SourceOcrLayoutPage[] = [];
    for (let index = 0; index < uniquePages.length; index += 1) {
      const pageNumber = uniquePages[index];
      if (!pageNumber) continue;
      onProgress?.({
        pageNumber,
        totalSelected: uniquePages.length,
        completed: index,
        message: `جارٍ تحليل مواضع النص في صفحة الفهرس ${pageNumber}…`,
      });
      const page = await pdf.getPage(pageNumber);
      const image = await renderPage(page);
      const layout = await sendPage({ sourceId, pageNumber, totalPages: pdf.numPages, image });
      layouts.push(layout);
      page.cleanup?.();
      onProgress?.({
        pageNumber,
        totalSelected: uniquePages.length,
        completed: index + 1,
        message: `اكتمل التحليل البصري لصفحة الفهرس ${pageNumber}.`,
      });
    }
    return layouts;
  } finally {
    pdf.cleanup?.();
    await pdf.destroy?.();
    await loadingTask.destroy?.();
  }
}
