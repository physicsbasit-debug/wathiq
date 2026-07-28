import type { SourceExtractionResult, SourceTextChunk } from "./types.js";

const PDFJS_VERSION = "4.10.38";
const PDFJS_BASE_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build`;
const PDFJS_MODULE_URL = `${PDFJS_BASE_URL}/pdf.mjs`;
const PDFJS_WORKER_URL = `${PDFJS_BASE_URL}/pdf.worker.mjs`;
const DEFAULT_CHUNK_SIZE = 3600;
const DEFAULT_CHUNK_OVERLAP = 220;
const OCR_MIN_CHARACTERS_PER_PAGE = 18;

interface PdfTextItemLike {
  str?: unknown;
  hasEOL?: unknown;
}

interface PdfPageLike {
  getTextContent(options?: Record<string, unknown>): Promise<{ items?: unknown[] }>;
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

export interface PdfExtractionAccess {
  url: string;
  httpHeaders: Record<string, string>;
}

export interface PdfExtractionProgress {
  pageNumber: number;
  totalPages: number;
  percent: number;
  message: string;
}

type PdfJsLoader = () => Promise<PdfJsLike>;

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

export function normalizeExtractedText(value: string): string {
  return value
    .replace(/\u0000/g, "")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\n +/g, "\n")
    .replace(/ {2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function textItemsToPageText(items: unknown[]): string {
  let output = "";
  for (const raw of items) {
    if (typeof raw !== "object" || raw === null) continue;
    const item = raw as PdfTextItemLike;
    if (typeof item.str !== "string" || !item.str) continue;
    output += item.str;
    output += item.hasEOL === true ? "\n" : " ";
  }
  return normalizeExtractedText(output);
}

export function detectDocumentLanguage(text: string): string {
  const arabic = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const total = arabic + latin;
  if (total < 20) return "غير محدد";
  const arabicRatio = arabic / total;
  const latinRatio = latin / total;
  if (arabicRatio >= 0.72) return "العربية";
  if (latinRatio >= 0.72) return "الإنجليزية";
  return "مختلط";
}

export function detectHeadingCandidates(pageTexts: string[], limit = 80): string[] {
  const headingPatterns = [
    /^(?:الوحدة|الفصل|الدرس|الموضوع|نواتج التعلم|الأهداف التعليمية|أهداف التعلم|نشاط|تجربة)(?:\s|[:：\-–—]|\d|$)/i,
    /^(?:unit|chapter|lesson|topic|learning outcomes?|objectives?|activity|experiment)\b/i,
  ];
  const seen = new Set<string>();
  const headings: string[] = [];
  for (const pageText of pageTexts) {
    for (const line of pageText.split(/\n+/)) {
      const normalized = line.replace(/\s+/g, " ").trim();
      if (normalized.length < 3 || normalized.length > 140) continue;
      if (!headingPatterns.some((pattern) => pattern.test(normalized))) continue;
      const key = normalized.toLocaleLowerCase("ar");
      if (seen.has(key)) continue;
      seen.add(key);
      headings.push(normalized);
      if (headings.length >= limit) return headings;
    }
  }
  return headings;
}

export function splitTextIntoChunks(
  pageTexts: string[],
  maxCharacters = DEFAULT_CHUNK_SIZE,
  overlapCharacters = DEFAULT_CHUNK_OVERLAP,
): SourceTextChunk[] {
  if (maxCharacters < 500) throw new Error("حجم مقطع الفهرسة صغير بصورة غير صالحة.");
  if (overlapCharacters < 0 || overlapCharacters >= maxCharacters) throw new Error("تداخل مقاطع الفهرسة غير صالح.");
  const chunks: SourceTextChunk[] = [];
  let chunkIndex = 0;

  pageTexts.forEach((pageText, pageOffset) => {
    const text = normalizeExtractedText(pageText);
    if (!text) return;
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + maxCharacters, text.length);
      if (end < text.length) {
        const paragraphBreak = text.lastIndexOf("\n", end);
        const sentenceBreak = Math.max(text.lastIndexOf(". ", end), text.lastIndexOf("؟ ", end), text.lastIndexOf("! ", end));
        const preferredBreak = Math.max(paragraphBreak, sentenceBreak);
        if (preferredBreak > start + Math.floor(maxCharacters * 0.55)) end = preferredBreak + 1;
      }
      const content = text.slice(start, end).trim();
      if (content) {
        chunks.push({
          chunkIndex,
          pageFrom: pageOffset + 1,
          pageTo: pageOffset + 1,
          content,
          characterCount: content.length,
        });
        chunkIndex += 1;
      }
      if (end >= text.length) break;
      start = Math.max(end - overlapCharacters, start + 1);
    }
  });

  return chunks;
}

export function buildExtractionResult(pageTexts: string[]): SourceExtractionResult {
  const normalizedPages = pageTexts.map(normalizeExtractedText);
  const nonEmptyPageCount = normalizedPages.filter(Boolean).length;
  const characterCount = normalizedPages.reduce((sum, text) => sum + text.length, 0);
  const combined = normalizedPages.filter(Boolean).join("\n\n");
  const pageCount = normalizedPages.length;
  const requiresOcr = characterCount < Math.max(120, pageCount * OCR_MIN_CHARACTERS_PER_PAGE);
  return {
    pageCount,
    characterCount,
    nonEmptyPageCount,
    language: detectDocumentLanguage(combined),
    preview: combined.slice(0, 1200),
    detectedHeadings: detectHeadingCandidates(normalizedPages),
    requiresOcr,
    chunks: requiresOcr ? [] : splitTextIntoChunks(normalizedPages),
  };
}

export async function extractPdfText(
  access: PdfExtractionAccess,
  onProgress?: (progress: PdfExtractionProgress) => void,
  loadPdfJs: PdfJsLoader = defaultPdfJsLoader,
): Promise<SourceExtractionResult> {
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
  const document = await loadingTask.promise;
  if (!Number.isSafeInteger(document.numPages) || document.numPages <= 0) {
    throw new Error("ملف PDF لا يحتوي صفحات قابلة للقراءة.");
  }

  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      onProgress?.({
        pageNumber,
        totalPages: document.numPages,
        percent: Math.max(1, Math.round(((pageNumber - 1) / document.numPages) * 90)),
        message: `جارٍ قراءة الصفحة ${pageNumber} من ${document.numPages}…`,
      });
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent({ disableNormalization: false, includeMarkedContent: false });
      pages.push(textItemsToPageText(Array.isArray(content.items) ? content.items : []));
      page.cleanup?.();
    }
    onProgress?.({
      pageNumber: document.numPages,
      totalPages: document.numPages,
      percent: 94,
      message: "جارٍ تجهيز النص للفهرسة…",
    });
    return buildExtractionResult(pages);
  } finally {
    document.cleanup?.();
    await document.destroy?.();
    await loadingTask.destroy?.();
  }
}
