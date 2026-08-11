import type { SourceExtractionQuality, SourceExtractionResult, SourceTextChunk } from "./types.js";

const PDFJS_VERSION = "4.10.38";
const PDFJS_BASE_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build`;
const PDFJS_MODULE_URL = `${PDFJS_BASE_URL}/pdf.mjs`;
const PDFJS_WORKER_URL = `${PDFJS_BASE_URL}/pdf.worker.mjs`;
const DEFAULT_CHUNK_SIZE = 3600;
const DEFAULT_CHUNK_OVERLAP = 220;
const OCR_MIN_CHARACTERS_PER_PAGE = 18;
const MIN_TEXT_CHARACTERS = 120;
const QUALITY_GATE_VERSION = "arabic-quality-gate-1";

const COMMON_ARABIC_WORDS = new Set([
  "في", "من", "على", "الى", "عن", "مع", "بين", "عند", "بعد", "قبل", "خلال", "حتى", "ثم", "او", "ام", "بل", "لا", "لم", "لن", "ما", "هو", "هي", "هم", "هن", "هذا", "هذه", "ذلك", "تلك", "هنا", "هناك", "الذي", "التي", "الذين", "اللاتي", "كل", "بعض", "اي", "اكثر", "اقل", "يمكن", "يكون", "تكون", "يتم", "تتم", "يجب", "قد", "كما", "حيث", "لذلك", "لان", "اذا", "ان", "انه", "انها", "كان", "كانت", "يؤدي", "تؤدي", "يساعد", "تساعد", "يعتمد", "تعتمد", "يستخدم", "تستخدم", "يوضح", "توضح", "يمثل", "تمثل", "يتكون", "تتكون", "تحتوي", "يحتوي", "يحدث", "تحدث", "ينتج", "تنتج", "تسمى", "يسمى", "مثل", "مثال", "التالي", "التالية", "الاول", "الاولى", "الثاني", "الثانية", "الصف", "الطالب", "الطلاب", "المعلم", "المعلمين", "المادة", "العلوم", "الدرس", "الوحدة", "الفصل", "النشاط", "التجربة", "السؤال", "الاجابة", "الشكل", "الجدول", "الرسم", "البيانات", "المعلومات", "النتائج", "الهدف", "الاهداف", "نواتج", "التعلم", "شرح", "اشرح", "فسر", "تفسير", "حدد", "اذكر", "قارن", "اختر", "صحيح", "خطا", "درجة", "درجات", "قيمة", "قيم", "عدد", "كتلة", "حجم", "زمن", "سرعة", "قوة", "طاقة", "حرارة", "مادة", "مواد", "جسم", "اجسام", "ماء", "هواء", "ضوء", "صوت", "حركة", "تغير", "تغيرات", "خاصية", "خصائص", "عملية", "عمليات", "نظام", "انظمة", "نوع", "انواع", "جزء", "اجزاء", "سبب", "اسباب", "نتيجة", "درجة", "صورة", "صور", "صفحة", "صفحات",
].map(normalizeArabicToken));

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

export type PdfExtractionInput = PdfExtractionAccess | File;

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

function normalizeArabicToken(value: string): string {
  return value
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/ـ/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLocaleLowerCase("ar");
}

function arabicWords(text: string): string[] {
  return (text.match(/[\u0621-\u063A\u0641-\u064A]{1,}/g) ?? [])
    .map(normalizeArabicToken)
    .filter(Boolean);
}

function arabicLetterShares(text: string): { maxShare: number; topFiveShare: number } {
  const letters = (text.match(/[\u0621-\u063A\u0641-\u064A]/g) ?? []).map(normalizeArabicToken);
  if (!letters.length) return { maxShare: 0, topFiveShare: 0 };
  const counts = new Map<string, number>();
  for (const letter of letters) counts.set(letter, (counts.get(letter) ?? 0) + 1);
  const shares = [...counts.values()].sort((a, b) => b - a).map((count) => count / letters.length);
  return {
    maxShare: shares[0] ?? 0,
    topFiveShare: shares.slice(0, 5).reduce((sum, share) => sum + share, 0),
  };
}

export function assessExtractedTextQuality(text: string): SourceExtractionQuality {
  const normalized = normalizeExtractedText(text);
  const arabicLetterCount = (normalized.match(/[\u0621-\u063A\u0641-\u064A]/g) ?? []).length;
  const latinLetterCount = (normalized.match(/[A-Za-z]/g) ?? []).length;
  const letterCount = arabicLetterCount + latinLetterCount;
  const words = arabicWords(normalized);
  const analyzableWords = words.filter((word) => word.length >= 2);
  const commonWordCount = analyzableWords.filter((word) => COMMON_ARABIC_WORDS.has(word)).length;
  const commonWordRatio = analyzableWords.length ? commonWordCount / analyzableWords.length : 0;
  const averageWordLength = words.length ? words.reduce((sum, word) => sum + word.length, 0) / words.length : 0;
  const longWordRatio = words.length ? words.filter((word) => word.length >= 12).length / words.length : 0;
  const veryLongWordRatio = words.length ? words.filter((word) => word.length >= 18).length / words.length : 0;
  const singleLetterWordRatio = words.length ? words.filter((word) => word.length === 1).length / words.length : 0;
  const { maxShare, topFiveShare } = arabicLetterShares(normalized);
  const arabicDominant = arabicLetterCount >= 100 && arabicLetterCount >= latinLetterCount * 1.2;

  if (letterCount < MIN_TEXT_CHARACTERS) {
    return {
      accepted: false,
      score: 0,
      reason: "insufficient_text",
      message: "لم يعثر واثق على نص كافٍ داخل الملف؛ يبدو أن الصفحات مصورة وتحتاج OCR.",
      arabicLetterCount,
      wordCount: words.length,
      commonWordRatio,
      averageWordLength,
      longWordRatio,
      singleLetterWordRatio,
      topFiveLetterShare: topFiveShare,
      qualityGateVersion: QUALITY_GATE_VERSION,
    };
  }

  if (!arabicDominant || analyzableWords.length < 30) {
    return {
      accepted: true,
      score: 82,
      reason: "accepted",
      message: "اجتاز النص فحص الجودة الأولي.",
      arabicLetterCount,
      wordCount: words.length,
      commonWordRatio,
      averageWordLength,
      longWordRatio,
      singleLetterWordRatio,
      topFiveLetterShare: topFiveShare,
      qualityGateVersion: QUALITY_GATE_VERSION,
    };
  }

  let penalty = 0;
  if (commonWordRatio < 0.03) penalty += 44;
  else if (commonWordRatio < 0.055) penalty += 30;
  else if (commonWordRatio < 0.085) penalty += 16;

  if (topFiveShare > 0.64) penalty += 24;
  else if (topFiveShare > 0.58) penalty += 13;
  else if (topFiveShare > 0.54) penalty += 6;

  if (maxShare > 0.2) penalty += 15;
  else if (maxShare > 0.17) penalty += 8;

  if (averageWordLength > 8) penalty += 20;
  else if (averageWordLength > 7.2) penalty += 12;
  else if (averageWordLength > 6.6) penalty += 6;

  if (longWordRatio > 0.13) penalty += 22;
  else if (longWordRatio > 0.08) penalty += 12;
  else if (longWordRatio > 0.05) penalty += 6;

  if (veryLongWordRatio > 0.035) penalty += 12;
  if (singleLetterWordRatio > 0.22) penalty += 10;

  const score = Math.max(0, 100 - penalty);
  const accepted = penalty < 40;
  return {
    accepted,
    score,
    reason: accepted ? "accepted" : "garbled_arabic",
    message: accepted
      ? "اجتاز النص العربي فحص الجودة الأولي."
      : "اكتشف واثق طبقة نص عربية مشوهة أو غير مقروءة داخل PDF؛ أوقف الفهرسة وحوّل الملف إلى مسار OCR.",
    arabicLetterCount,
    wordCount: words.length,
    commonWordRatio,
    averageWordLength,
    longWordRatio,
    singleLetterWordRatio,
    topFiveLetterShare: topFiveShare,
    qualityGateVersion: QUALITY_GATE_VERSION,
  };
}

export function shouldInvalidateLegacyExtraction(preview: string): boolean {
  const quality = assessExtractedTextQuality(preview);
  return quality.reason === "garbled_arabic" && quality.score <= 60;
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
  const insufficientText = characterCount < Math.max(MIN_TEXT_CHARACTERS, pageCount * OCR_MIN_CHARACTERS_PER_PAGE);
  const overallQuality = assessExtractedTextQuality(combined);
  const analyzablePageQualities = normalizedPages
    .filter((page) => (page.match(/[\u0621-\u063A\u0641-\u064A]/g) ?? []).length >= 140)
    .map(assessExtractedTextQuality);
  const rejectedPageCount = analyzablePageQualities.filter((quality) => !quality.accepted && quality.reason === "garbled_arabic").length;
  const rejectedPageRatio = analyzablePageQualities.length ? rejectedPageCount / analyzablePageQualities.length : 0;
  const garbledArabic = overallQuality.reason === "garbled_arabic" || (
    analyzablePageQualities.length >= 2 && rejectedPageCount >= 2 && rejectedPageRatio > 0.34
  );
  const requiresOcr = insufficientText || garbledArabic;
  const quality: SourceExtractionQuality = insufficientText
    ? { ...overallQuality, accepted: false, score: 0, reason: "insufficient_text", message: "لم يعثر واثق على نص كافٍ داخل الملف؛ يبدو أن الصفحات مصورة وتحتاج OCR." }
    : garbledArabic
      ? {
          ...overallQuality,
          accepted: false,
          score: Math.min(overallQuality.score, Math.max(0, Math.round(100 - rejectedPageRatio * 100))),
          reason: "garbled_arabic",
          message: "اكتشف واثق طبقة نص عربية مشوهة أو غير مقروءة داخل PDF؛ أوقف الفهرسة وحوّل الملف إلى مسار OCR.",
        }
      : overallQuality;
  return {
    method: "pdf-text",
    pageCount,
    characterCount,
    nonEmptyPageCount,
    language: detectDocumentLanguage(combined),
    preview: requiresOcr ? "" : combined.slice(0, 1200),
    detectedHeadings: requiresOcr ? [] : detectHeadingCandidates(normalizedPages),
    requiresOcr,
    quality,
    chunks: requiresOcr ? [] : splitTextIntoChunks(normalizedPages),
  };
}

export async function extractPdfText(
  input: PdfExtractionInput,
  onProgress?: (progress: PdfExtractionProgress) => void,
  loadPdfJs: PdfJsLoader = defaultPdfJsLoader,
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
      message: "جارٍ فحص جودة النص وتجهيزه للفهرسة…",
    });
    return buildExtractionResult(pages);
  } finally {
    document.cleanup?.();
    await document.destroy?.();
    await loadingTask.destroy?.();
  }
}
