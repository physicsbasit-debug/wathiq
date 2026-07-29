import type {
  SourceStructureExtractionOptions,
  SourceStructureExtractionResult,
  SourceStructureNode,
  SourceStructureNodeType,
  SourceStructureValidation,
  SourceTextChunk,
} from "./types.js";

export const SOURCE_STRUCTURE_NODE_TYPES: SourceStructureNodeType[] = [
  "وحدة",
  "درس",
  "موضوع",
  "نشاط",
  "مراجعة",
  "أسئلة",
];

const STRUCTURE_VERSION = "toc-golden-4";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EXCLUDED_TITLE_PATTERN = /(?:حقوق\s+(?:الطبع|الطباعة|النشر)|الطبعة\s+(?:التجريبية|الأولى|الثانية|الثالثة)|الرقم\s+الدولي|ISBN|الفهرس|المحتويات|مقدمة\s+الكتاب|شكر\s+وتقدير|المؤلف(?:ون|ين)?|وزارة\s+(?:التربية|التعليم)|مطبعة\s+جامعة|بيانات\s+النشر)/i;
const TOC_HEADER_PATTERN = /^(?:ال?فهرس|ال?محتويات|محتويات\s+الكتاب|قائمة\s+المحتويات|contents?)\s*[:：-]?\s*$/i;
const UNIT_PATTERN = /^(?:الوحدة|وحدة)\s+(?:الأولى|الثانية|الثالثة|الرابعة|الخامسة|السادسة|السابعة|الثامنة|التاسعة|العاشرة|الحادية\s+عشرة|الثانية\s+عشرة|\d+|[٠-٩]+)(?:\s|:|：|-|$)/i;
const LESSON_PATTERN = /^(?:الدرس|درس)\s+(?:الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|\d+|[٠-٩]+)(?:\s|:|：|-|$)/i;
const TOPIC_PATTERN = /^(?:الفصل|الموضوع|موضوع)(?:\s|:|：|-|$)/i;
const ACTIVITY_PATTERN = /^(?:نشاط(?:\s+عملي)?|تجربة|استقصاء|مختبر|عمل\s+مخبري)(?:\s|:|：|-|$)/i;
const REVIEW_PATTERN = /^(?:مراجعة|ملخص|خلاصة)(?:\s|:|：|-|$)/i;
const QUESTIONS_PATTERN = /^(?:أسئلة|تقويم|تمارين|اختبر\s+نفسك|أسئلة\s+الوحدة)(?:\s|:|：|-|$)/i;
const NUMBERED_SUBSECTION_PATTERN = /^([0-9٠-٩]+(?:[.٫\-–—][0-9٠-٩]+)+)\s*[-–—:]?\s*(.+)$/;
const NUMBERED_TOC_LESSON_PATTERN = /^([0-9٠-٩]{1,2})\s*[-–—‑]\s*([0-9٠-٩]{1,2})\s+(.+?)\s+([0-9٠-٩]{1,4})\s*$/;
const NUMBERED_TOC_LESSON_LEADING_PAGE_PATTERN = /^([0-9٠-٩]{1,4})\s+([0-9٠-٩]{1,2})\s*[-–—‑]\s*([0-9٠-٩]{1,2})\s+(.+?)\s*$/;
const NUMBERED_TOC_LESSON_WITHOUT_PAGE_PATTERN = /^([0-9٠-٩]{1,2})\s*[-–—‑]\s*([0-9٠-٩]{1,2})\s+(.+?)\s*$/;
const UNIT_ORDINAL_WORDS = new Map<string, number>([
  ["الأولى", 1], ["الاولى", 1], ["الثانية", 2], ["الثالثة", 3], ["الرابعة", 4],
  ["الخامسة", 5], ["السادسة", 6], ["السابعة", 7], ["الثامنة", 8], ["التاسعة", 9],
  ["العاشرة", 10], ["الحادية عشرة", 11], ["الحاديه عشره", 11], ["الثانية عشرة", 12], ["الثانيه عشره", 12],
]);

interface SourcePageText {
  pageNumber: number;
  content: string;
}

interface ParsedCandidate {
  nodeType: SourceStructureNodeType;
  title: string;
  pageStart: number;
  sourcePage: number;
  confidence: number;
  fromToc: boolean;
  explicit: boolean;
  unitOrdinal?: number;
  lessonOrdinal?: number;
}

interface PageTocAnalysis {
  page: SourcePageText;
  entries: ParsedCandidate[];
  hasHeader: boolean;
  numberedToc: boolean;
  qualityScore: number;
}


function parseUnitOrdinal(value: string): number | null {
  const title = normalizeArabicDigits(cleanStructureTitle(value))
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
  const match = title.match(/^(?:الوحده|وحده)\s+(.+?)(?:\s*[:：-]|$)/i);
  if (!match?.[1]) return null;
  const raw = match[1].trim();
  const numeric = raw.match(/^\d{1,2}$/);
  if (numeric) {
    const valueNumber = Number(numeric[0]);
    return valueNumber >= 1 && valueNumber <= 30 ? valueNumber : null;
  }
  for (const [word, ordinal] of UNIT_ORDINAL_WORDS.entries()) {
    const normalizedWord = word.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
    if (raw === normalizedWord || raw.startsWith(`${normalizedWord} `)) return ordinal;
  }
  return null;
}

function stripTrailingPageNumber(value: string): string {
  return cleanStructureTitle(value).replace(/\s+[0-9٠-٩]{1,4}\s*$/, "").trim();
}

function parseNumberedTocLesson(value: string, sourcePage: number): ParsedCandidate | null {
  const cleaned = cleanStructureTitle(value);
  const normalized = normalizeArabicDigits(cleaned);
  const codeMatches = [...normalized.matchAll(/([0-9]{1,2})\s*[-–—‑]\s*([0-9]{1,2})/g)];
  if (codeMatches.length !== 1) return null;
  const code = codeMatches[0];
  const unitOrdinal = Number(code?.[1]);
  const lessonOrdinal = Number(code?.[2]);
  if (!Number.isSafeInteger(unitOrdinal) || unitOrdinal < 1 || unitOrdinal > 30) return null;
  if (!Number.isSafeInteger(lessonOrdinal) || lessonOrdinal < 1 || lessonOrdinal > 99) return null;

  const codeText = code?.[0] ?? "";
  const codeIndex = code?.index ?? -1;
  if (!codeText || codeIndex < 0) return null;
  let remainder = `${normalized.slice(0, codeIndex)} ${normalized.slice(codeIndex + codeText.length)}`.replace(/\s+/g, " ").trim();

  const leadingPage = remainder.match(/^([0-9]{1,4})\s+(.+)$/);
  const trailingPage = remainder.match(/^(.+?)\s+([0-9]{1,4})$/);
  let pageRaw: string | undefined;
  let titleRaw: string | undefined;
  if (leadingPage?.[1] && leadingPage[2]) {
    pageRaw = leadingPage[1];
    titleRaw = leadingPage[2];
  } else if (trailingPage?.[1] && trailingPage[2]) {
    titleRaw = trailingPage[1];
    pageRaw = trailingPage[2];
  }
  if (!pageRaw || !titleRaw) return null;

  const pageStart = Number(pageRaw);
  const lessonTitle = cleanStructureTitle(titleRaw);
  if (!Number.isSafeInteger(pageStart) || pageStart < 1 || pageStart > 5000) return null;
  const meaningfulNumberedLesson = titleHasEnoughMeaning(lessonTitle)
    || (lessonTitle.length >= 4 && countArabicLetters(lessonTitle) >= 4 && !looksLikeFormulaOrNoise(lessonTitle));
  if (!meaningfulNumberedLesson || EXCLUDED_TITLE_PATTERN.test(lessonTitle)) return null;
  return {
    nodeType: "درس",
    title: `${unitOrdinal}-${lessonOrdinal} ${lessonTitle}`,
    pageStart,
    sourcePage,
    confidence: 0.99,
    fromToc: true,
    explicit: true,
    unitOrdinal,
    lessonOrdinal,
  };
}

function parseNumberedMultiColumnTocPage(page: SourcePageText): ParsedCandidate[] {
  const lines = page.content.split(/\n+/).map(cleanStructureTitle).filter(Boolean);
  const units = new Map<number, ParsedCandidate>();
  const lessons = new Map<string, ParsedCandidate>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (UNIT_PATTERN.test(line)) {
      const ordinal = parseUnitOrdinal(line);
      if (ordinal) {
        const title = stripTrailingPageNumber(line);
        if (!titleIsExcluded(title) && !looksLikeFormulaOrNoise(title)) {
          const current = units.get(ordinal);
          if (!current || title.length > current.title.length) {
            units.set(ordinal, {
              nodeType: "وحدة",
              title,
              pageStart: 0,
              sourcePage: page.pageNumber,
              confidence: 0.995,
              fromToc: true,
              explicit: true,
              unitOrdinal: ordinal,
            });
          }
        }
      }
      continue;
    }

    let lesson: ParsedCandidate | null = null;
    let consumed = 1;
    for (let width = 1; width <= 3 && index + width <= lines.length; width += 1) {
      const window = lines.slice(index, index + width);
      if (width > 1 && window.slice(1).some((part) => UNIT_PATTERN.test(part))) break;
      const candidateText = window.join(" ");
      lesson = parseNumberedTocLesson(candidateText, page.pageNumber);
      if (lesson) {
        consumed = width;
        break;
      }
    }
    if (lesson?.unitOrdinal && lesson.lessonOrdinal) {
      lessons.set(`${lesson.unitOrdinal}-${lesson.lessonOrdinal}`, lesson);
      index += consumed - 1;
    }
  }

  const unitOrdinals = [...units.keys()].sort((left, right) => left - right);
  if (unitOrdinals.length < 4 || lessons.size < 6) return [];
  for (let index = 1; index < unitOrdinals.length; index += 1) {
    if ((unitOrdinals[index] ?? 0) !== (unitOrdinals[index - 1] ?? 0) + 1) return [];
  }
  const lessonsByUnit = new Map<number, ParsedCandidate[]>();
  lessons.forEach((lesson) => {
    if (!lesson.unitOrdinal) return;
    const list = lessonsByUnit.get(lesson.unitOrdinal) ?? [];
    list.push(lesson);
    lessonsByUnit.set(lesson.unitOrdinal, list);
  });
  if (unitOrdinals.some((ordinal) => !(lessonsByUnit.get(ordinal)?.length))) return [];
  if ([...lessonsByUnit.keys()].some((ordinal) => !units.has(ordinal))) return [];

  const entries: ParsedCandidate[] = [];
  unitOrdinals.forEach((ordinal) => {
    const unit = units.get(ordinal);
    if (!unit) return;
    const unitLessons = (lessonsByUnit.get(ordinal) ?? [])
      .sort((left, right) => (left.lessonOrdinal ?? 0) - (right.lessonOrdinal ?? 0) || left.pageStart - right.pageStart);
    entries.push({ ...unit, pageStart: unitLessons[0]?.pageStart ?? page.pageNumber });
    entries.push(...unitLessons);
  });

  return entries.length >= 10 ? entries : [];
}

function normalizeArabicDigits(value: string): string {
  return value.replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));
}

function parsePageNumber(value: string): number | null {
  const normalized = normalizeArabicDigits(value).replace(/[^0-9]/g, "");
  if (!normalized) return null;
  const page = Number(normalized);
  return Number.isSafeInteger(page) && page > 0 && page <= 5000 ? page : null;
}

export function parsePageSelection(value: string, totalPages: number): number[] {
  const selected = new Set<number>();
  const normalized = normalizeArabicDigits(value)
    .replace(/[،؛;]/g, ",")
    .replace(/[–—]/g, "-")
    .trim();
  if (!normalized) return [];
  normalized.split(/[\s,]+/).filter(Boolean).forEach((token) => {
    const range = token.match(/^(\d{1,4})-(\d{1,4})$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      const lower = Math.min(start, end);
      const upper = Math.max(start, end);
      if (upper - lower > 20) return;
      for (let page = lower; page <= upper; page += 1) {
        if (page >= 1 && page <= totalPages) selected.add(page);
      }
      return;
    }
    const page = Number(token.replace(/\D/g, ""));
    if (Number.isSafeInteger(page) && page >= 1 && page <= totalPages) selected.add(page);
  });
  return [...selected].sort((left, right) => left - right);
}

export function cleanStructureTitle(value: string): string {
  return value
    .replace(/[.…·•_]{2,}/g, " ")
    .replace(/^[\s\-–—:؛،.]+|[\s\-–—:؛،.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedTitleKey(value: string): string {
  return normalizeArabicDigits(cleanStructureTitle(value))
    .toLocaleLowerCase("ar")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function countArabicLetters(value: string): number {
  return (value.match(/[\u0600-\u06FF]/g) ?? []).length;
}

function countLatinLetters(value: string): number {
  return (value.match(/[A-Za-z]/g) ?? []).length;
}

function countDigits(value: string): number {
  return (normalizeArabicDigits(value).match(/[0-9]/g) ?? []).length;
}

function looksLikeFormulaOrNoise(value: string): boolean {
  const title = cleanStructureTitle(value);
  const arabic = countArabicLetters(title);
  const latin = countLatinLetters(title);
  const digits = countDigits(title);
  const symbols = (title.match(/[=+×÷ΩµλγΔΣπ^<>()[\]{}]/g) ?? []).length;
  const compactLength = title.replace(/\s/g, "").length || 1;
  const scientificNoise = latin + digits + symbols;
  if (arabic < 4 && scientificNoise >= 3) return true;
  if (scientificNoise / compactLength > 0.42 && arabic < 12) return true;
  if (/^(?:[A-Za-z]\s*){2,}|^(?:\d+\s*){2,}$/.test(title)) return true;
  if (/^[A-Za-z0-9ΩµλγΔΣπ\s=+×÷^().-]+$/.test(title)) return true;
  return false;
}

function titleHasEnoughMeaning(value: string): boolean {
  const title = cleanStructureTitle(value);
  if (title.length < 5 || title.length > 160) return false;
  if (looksLikeFormulaOrNoise(title)) return false;
  const words = title.split(/\s+/).filter(Boolean);
  const arabic = countArabicLetters(title);
  return words.length >= 2 && arabic >= 4;
}

function nodeTypeForTitle(title: string, allowNumberedSubsection = true): { nodeType: SourceStructureNodeType; confidence: number; explicit: boolean } | null {
  if (UNIT_PATTERN.test(title)) return { nodeType: "وحدة", confidence: 0.98, explicit: true };
  if (LESSON_PATTERN.test(title)) return { nodeType: "درس", confidence: 0.96, explicit: true };
  if (ACTIVITY_PATTERN.test(title)) return { nodeType: "نشاط", confidence: 0.93, explicit: true };
  if (REVIEW_PATTERN.test(title)) return { nodeType: "مراجعة", confidence: 0.93, explicit: true };
  if (QUESTIONS_PATTERN.test(title)) return { nodeType: "أسئلة", confidence: 0.93, explicit: true };
  if (TOPIC_PATTERN.test(title)) return { nodeType: "موضوع", confidence: 0.9, explicit: true };
  const subsection = allowNumberedSubsection ? title.match(NUMBERED_SUBSECTION_PATTERN) : null;
  if (subsection?.[2] && titleHasEnoughMeaning(subsection[2])) {
    return { nodeType: "درس", confidence: 0.84, explicit: false };
  }
  return null;
}

function titleIsExcluded(title: string): boolean {
  const normalized = cleanStructureTitle(title);
  return !titleHasEnoughMeaning(normalized) || EXCLUDED_TITLE_PATTERN.test(normalized);
}

function pageHasTocHeader(page: SourcePageText): boolean {
  return page.content
    .split(/\n+/)
    .slice(0, 30)
    .some((line) => TOC_HEADER_PATTERN.test(cleanStructureTitle(line)));
}

function parseInlineTocLine(line: string, sourcePage: number): ParsedCandidate | null {
  const raw = line.replace(/\s+/g, " ").trim();
  if (!raw || TOC_HEADER_PATTERN.test(cleanStructureTitle(raw))) return null;
  const leading = raw.match(/^([0-9٠-٩]{1,4})\s+((?:الوحدة|وحدة|الدرس|درس|الفصل|الموضوع|موضوع|نشاط|تجربة|استقصاء|مختبر|مراجعة|ملخص|خلاصة|أسئلة|تقويم|تمارين|اختبر\s+نفسك).{3,150})$/i);
  const dotted = raw.match(/^(.*?)(?:\s*[.…·•_]{2,}\s*)([0-9٠-٩]{1,4})\s*$/);
  const spaced = dotted ?? raw.match(/^((?:الوحدة|وحدة|الدرس|درس|الفصل|الموضوع|موضوع|نشاط|تجربة|استقصاء|مختبر|مراجعة|ملخص|خلاصة|أسئلة|تقويم|تمارين|اختبر\s+نفسك|[0-9٠-٩]+(?:[.٫][0-9٠-٩]+)+).{3,145}?)\s+([0-9٠-٩]{1,4})\s*$/i);
  const rawTitle = leading?.[2] ?? spaced?.[1];
  const rawPage = leading?.[1] ?? spaced?.[2];
  if (!rawTitle || !rawPage) return null;
  const title = cleanStructureTitle(rawTitle);
  const pageStart = parsePageNumber(rawPage);
  const typed = nodeTypeForTitle(title, true);
  if (!pageStart || !typed || titleIsExcluded(title)) return null;
  return {
    nodeType: typed.nodeType,
    title,
    pageStart,
    sourcePage,
    confidence: Math.min(0.99, typed.confidence + (typed.explicit ? 0.01 : 0)),
    fromToc: true,
    explicit: typed.explicit,
  };
}

function parseTocPage(page: SourcePageText): ParsedCandidate[] {
  const numbered = parseNumberedMultiColumnTocPage(page);
  if (numbered.length) return numbered;
  const lines = page.content.split(/\n+/).map(cleanStructureTitle).filter(Boolean);
  const entries: ParsedCandidate[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    const inline = parseInlineTocLine(line, page.pageNumber);
    if (inline) {
      entries.push(inline);
      continue;
    }
    const nextLine = lines[index + 1];
    const typed = nodeTypeForTitle(line, true);
    const nextPage = nextLine ? parsePageNumber(nextLine) : null;
    if (typed && nextPage && !titleIsExcluded(line)) {
      entries.push({
        nodeType: typed.nodeType,
        title: line,
        pageStart: nextPage,
        sourcePage: page.pageNumber,
        confidence: typed.confidence,
        fromToc: true,
        explicit: typed.explicit,
      });
      index += 1;
    }
  }
  return entries;
}

function coherentPageRatio(entries: ParsedCandidate[]): number {
  if (entries.length < 2) return 0;
  let coherent = 0;
  for (let index = 1; index < entries.length; index += 1) {
    const previous = entries[index - 1];
    const current = entries[index];
    if (previous && current && current.pageStart >= previous.pageStart) coherent += 1;
  }
  return coherent / (entries.length - 1);
}

function tocEntriesAreReliable(entries: ParsedCandidate[], totalPages: number, manual = false): boolean {
  if (entries.length < (manual ? 2 : 3)) return false;
  const explicitCount = entries.filter((entry) => entry.explicit).length;
  const unitCount = entries.filter((entry) => entry.nodeType === "وحدة").length;
  const meaningfulPages = new Set(entries.map((entry) => entry.pageStart)).size;
  const inRangeCount = entries.filter((entry) => entry.pageStart <= Math.max(totalPages + 20, 50)).length;
  return explicitCount >= (manual ? 1 : 2)
    && unitCount >= 1
    && meaningfulPages >= 2
    && inRangeCount / entries.length >= 0.9
    && coherentPageRatio(entries) >= 0.75;
}

function analyzeTocPages(pages: SourcePageText[], totalPages: number): PageTocAnalysis[] {
  return pages.map((page) => {
    const numberedEntries = parseNumberedMultiColumnTocPage(page);
    const numberedToc = numberedEntries.length > 0;
    const entries = numberedToc ? numberedEntries : parseTocPage(page);
    const hasHeader = pageHasTocHeader(page);
    const explicitCount = entries.filter((entry) => entry.explicit).length;
    const qualityScore = entries.length * 2 + explicitCount * 2 + (hasHeader ? 12 : 0) + (numberedToc ? 20 : 0) + Math.round(coherentPageRatio(entries) * 5);
    return { page, entries, hasHeader, numberedToc, qualityScore };
  });
}

function selectReliableTocGroup(analyses: PageTocAnalysis[], totalPages: number): PageTocAnalysis[] {
  let best: PageTocAnalysis[] = [];
  let bestScore = -1;
  analyses.forEach((analysis, index) => {
    if (!analysis.hasHeader && !analysis.numberedToc) return;
    const group: PageTocAnalysis[] = [analysis];
    let previousMax = Math.max(...analysis.entries.map((entry) => entry.pageStart), 0);
    for (let offset = 1; offset <= 3; offset += 1) {
      const next = analyses[index + offset];
      if (!next || next.page.pageNumber !== analysis.page.pageNumber + offset || next.entries.length < 2) break;
      const nextMin = Math.min(...next.entries.map((entry) => entry.pageStart));
      if (previousMax && nextMin + 3 < previousMax) break;
      group.push(next);
      previousMax = Math.max(previousMax, ...next.entries.map((entry) => entry.pageStart));
    }
    const entries = group.flatMap((item) => item.entries);
    if (!tocEntriesAreReliable(entries, totalPages, false)) return;
    const score = group.reduce((sum, item) => sum + item.qualityScore, 0) + entries.length;
    if (score > bestScore) {
      best = group;
      bestScore = score;
    }
  });
  return best;
}

function parseExplicitUnitHeadings(pages: SourcePageText[]): ParsedCandidate[] {
  const byOrdinal = new Map<number, ParsedCandidate>();
  const fallback: ParsedCandidate[] = [];
  for (const page of pages) {
    const lines = page.content.split(/\n+/).map(cleanStructureTitle).filter(Boolean).slice(0, 24);
    for (const line of lines) {
      if (!UNIT_PATTERN.test(line) || titleIsExcluded(line) || looksLikeFormulaOrNoise(line)) continue;
      const title = stripTrailingPageNumber(line);
      const ordinal = parseUnitOrdinal(title);
      const candidate: ParsedCandidate = {
        nodeType: "وحدة",
        title,
        pageStart: page.pageNumber,
        sourcePage: page.pageNumber,
        confidence: 0.83,
        fromToc: false,
        explicit: true,
        ...(ordinal ? { unitOrdinal: ordinal } : {}),
      };
      if (candidate.unitOrdinal) {
        const current = byOrdinal.get(candidate.unitOrdinal);
        if (!current || candidate.pageStart < current.pageStart) byOrdinal.set(candidate.unitOrdinal, candidate);
      } else {
        fallback.push(candidate);
      }
    }
  }
  const deduplicated = [
    ...[...byOrdinal.values()].sort((left, right) => (left.unitOrdinal ?? 0) - (right.unitOrdinal ?? 0)),
    ...deduplicateCandidates(fallback),
  ];
  if (deduplicated.length < 2) return [];
  return deduplicated;
}

function longestOverlap(left: string, right: string, maxLength = 500): number {
  const max = Math.min(left.length, right.length, maxLength);
  for (let length = max; length >= 24; length -= 1) {
    if (left.slice(-length) === right.slice(0, length)) return length;
  }
  return 0;
}

export function chunksToPageTexts(chunks: SourceTextChunk[]): SourcePageText[] {
  const byPage = new Map<number, SourceTextChunk[]>();
  chunks.forEach((chunk) => {
    const page = chunk.pageFrom;
    const existing = byPage.get(page) ?? [];
    existing.push(chunk);
    byPage.set(page, existing);
  });
  return [...byPage.entries()]
    .sort(([left], [right]) => left - right)
    .map(([pageNumber, pageChunks]) => {
      const ordered = pageChunks.sort((left, right) => left.chunkIndex - right.chunkIndex);
      let content = "";
      ordered.forEach((chunk) => {
        const text = chunk.content.trim();
        if (!text) return;
        if (!content) {
          content = text;
          return;
        }
        if (content.includes(text)) return;
        const overlap = longestOverlap(content, text);
        content += `${overlap ? "" : "\n"}${text.slice(overlap)}`;
      });
      return { pageNumber, content };
    });
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function deduplicateCandidates(candidates: ParsedCandidate[]): ParsedCandidate[] {
  const best = new Map<string, ParsedCandidate>();
  candidates.forEach((candidate) => {
    const key = `${candidate.nodeType}|${normalizedTitleKey(candidate.title)}`;
    const current = best.get(key);
    if (!current || candidate.confidence > current.confidence || (candidate.confidence === current.confidence && candidate.pageStart < current.pageStart)) {
      best.set(key, candidate);
    }
  });
  return [...best.values()].sort((left, right) => left.pageStart - right.pageStart || right.confidence - left.confidence || left.title.localeCompare(right.title, "ar"));
}

function candidatesAfterFirstUnit(candidates: ParsedCandidate[]): ParsedCandidate[] {
  const firstUnitIndex = candidates.findIndex((candidate) => candidate.nodeType === "وحدة");
  if (firstUnitIndex < 0) return [];
  return candidates.slice(firstUnitIndex).filter((candidate) => candidate.confidence >= 0.82 && !looksLikeFormulaOrNoise(candidate.title));
}

function buildNodes(sourceId: string, candidates: ParsedCandidate[], totalPages: number): SourceStructureNode[] {
  const nodes: SourceStructureNode[] = [];
  let currentUnitId: string | null = null;
  const now = new Date().toISOString();
  candidatesAfterFirstUnit(candidates).forEach((candidate, index) => {
    const id = `structure-${stableHash(`${sourceId}|${candidate.nodeType}|${normalizedTitleKey(candidate.title)}|${candidate.pageStart}`)}`;
    const parentId = candidate.nodeType === "وحدة" ? null : currentUnitId;
    if (candidate.nodeType !== "وحدة" && !parentId) return;
    const node: SourceStructureNode = {
      id,
      sourceId,
      parentId,
      nodeType: candidate.nodeType,
      title: candidate.title,
      pageStart: Math.max(1, Math.min(totalPages || candidate.pageStart, candidate.pageStart)),
      pageEnd: Math.max(1, Math.min(totalPages || candidate.pageStart, candidate.pageStart)),
      orderIndex: index,
      confidence: candidate.confidence,
      reviewStatus: "مرشح",
      extractionMethod: candidate.fromToc ? STRUCTURE_VERSION : `${STRUCTURE_VERSION}-unit-scan`,
      createdAt: now,
      updatedAt: now,
    };
    nodes.push(node);
    if (candidate.nodeType === "وحدة") currentUnitId = id;
  });

  const roots = nodes.filter((node) => node.parentId === null);
  roots.forEach((root, rootIndex) => {
    const nextRoot = roots[rootIndex + 1];
    root.pageEnd = Math.max(root.pageStart, (nextRoot?.pageStart ?? (totalPages + 1)) - 1);
  });

  nodes.forEach((node) => {
    if (!node.parentId) return;
    const siblings = nodes.filter((candidate) => candidate.parentId === node.parentId);
    const siblingIndex = siblings.findIndex((candidate) => candidate.id === node.id);
    const nextSibling = siblings[siblingIndex + 1];
    const parent = nodes.find((candidate) => candidate.id === node.parentId);
    node.pageEnd = Math.max(node.pageStart, (nextSibling?.pageStart ?? ((parent?.pageEnd ?? totalPages) + 1)) - 1);
  });

  return resequenceStructureNodes(nodes);
}

function candidateTocPageNumbers(analyses: PageTocAnalysis[]): number[] {
  return analyses
    .filter((analysis) => analysis.numberedToc || analysis.entries.length >= 2)
    .sort((left, right) => right.qualityScore - left.qualityScore)
    .slice(0, 6)
    .map((analysis) => analysis.page.pageNumber)
    .sort((left, right) => left - right);
}

export function extractSourceStructure(
  sourceId: string,
  chunks: SourceTextChunk[],
  totalPages: number,
  options: SourceStructureExtractionOptions = {},
): SourceStructureExtractionResult {
  const pages = chunksToPageTexts(chunks);
  const resolvedTotalPages = totalPages || pages.at(-1)?.pageNumber || 1;
  const analyses = analyzeTocPages(pages, resolvedTotalPages);
  const manualPages = [...new Set(options.tocPages ?? [])].filter((page) => page >= 1 && page <= resolvedTotalPages).sort((left, right) => left - right);
  const candidatePages = candidateTocPageNumbers(analyses);

  if (manualPages.length) {
    const selected = analyses.filter((analysis) => manualPages.includes(analysis.page.pageNumber));
    const entries = deduplicateCandidates(selected.flatMap((analysis) => analysis.entries));
    if (!tocEntriesAreReliable(entries, resolvedTotalPages, true)) {
      return {
        sourceId,
        nodes: [],
        tocPages: manualPages,
        usedFallback: false,
        reliableTocFound: false,
        manualTocRequired: true,
        candidateTocPages: candidatePages,
        message: "الصفحات المحددة لا تحتوي فهرسًا منظمًا بدرجة كافية. راجع أرقام الصفحات أو أضف الهيكل يدويًا.",
      };
    }
    const candidates = candidatesAfterFirstUnit(entries);
    const nodes = buildNodes(sourceId, candidates, resolvedTotalPages);
    return {
      sourceId,
      nodes,
      tocPages: manualPages,
      usedFallback: false,
      reliableTocFound: true,
      manualTocRequired: false,
      candidateTocPages: candidatePages,
      message: `استخرج واثق ${nodes.filter((node) => node.nodeType === "وحدة").length} وحدة و${nodes.filter((node) => node.nodeType !== "وحدة").length} عنصرًا تابعًا من الصفحات المحددة ${manualPages.join("، ")}.`,
    };
  }

  const reliableGroup = selectReliableTocGroup(analyses, resolvedTotalPages);
  if (reliableGroup.length) {
    const entries = deduplicateCandidates(reliableGroup.flatMap((analysis) => analysis.entries));
    const nodes = buildNodes(sourceId, entries, resolvedTotalPages);
    const tocPages = reliableGroup.map((analysis) => analysis.page.pageNumber);
    return {
      sourceId,
      nodes,
      tocPages,
      usedFallback: false,
      reliableTocFound: true,
      manualTocRequired: false,
      candidateTocPages: candidatePages,
      message: `استخرج واثق ${nodes.filter((node) => node.nodeType === "وحدة").length} وحدة و${nodes.filter((node) => node.nodeType !== "وحدة").length} عنصرًا تابعًا من صفحات الفهرس ${tocPages.join("، ")}.`,
    };
  }

  const allowFallback = options.allowUnitHeadingFallback === true;
  const fallbackUnits = allowFallback ? parseExplicitUnitHeadings(pages) : [];
  if (fallbackUnits.length) {
    const nodes = buildNodes(sourceId, fallbackUnits, resolvedTotalPages);
    return {
      sourceId,
      nodes,
      tocPages: [],
      usedFallback: true,
      reliableTocFound: false,
      manualTocRequired: true,
      candidateTocPages: candidatePages,
      message: `لم يُعثر على فهرس موثوق. استخرج واثق ${nodes.length} وحدة من عناوين صريحة فقط؛ حدّد صفحات الفهرس يدويًا لاستخراج الدروس والأنشطة.`,
    };
  }

  return {
    sourceId,
    nodes: [],
    tocPages: [],
    usedFallback: false,
    reliableTocFound: false,
    manualTocRequired: true,
    candidateTocPages: candidatePages,
    message: candidatePages.length
      ? `لم يُعثر على فهرس موثوق. جرّب تحديد صفحات الفهرس يدويًا؛ الصفحات المرشحة: ${candidatePages.join("، ")}.`
      : "لم يُعثر على فهرس موثوق. حدّد صفحات الفهرس يدويًا أو أضف الهيكل يدويًا.",
  };
}

export function resequenceStructureNodes(nodes: SourceStructureNode[]): SourceStructureNode[] {
  const roots = nodes.filter((node) => node.parentId === null).sort((left, right) => left.orderIndex - right.orderIndex);
  const ordered: SourceStructureNode[] = [];
  roots.forEach((root) => {
    ordered.push(root);
    nodes
      .filter((node) => node.parentId === root.id)
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .forEach((child) => ordered.push(child));
  });
  nodes
    .filter((node) => node.parentId !== null && !roots.some((root) => root.id === node.parentId))
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .forEach((node) => ordered.push({ ...node, parentId: null }));
  return ordered.map((node, orderIndex) => ({ ...node, orderIndex }));
}


export function shouldQuarantineLegacyStructureDraft(nodes: SourceStructureNode[]): boolean {
  if (!nodes.length) return false;
  if (nodes.some((node) => node.reviewStatus === "معتمد" || node.extractionMethod === "manual")) return false;
  if (nodes.every((node) => node.extractionMethod.startsWith(STRUCTURE_VERSION))) return false;

  const noisyCount = nodes.filter((node) => looksLikeFormulaOrNoise(node.title) || !titleHasEnoughMeaning(node.title)).length;
  const unitCount = nodes.filter((node) => node.nodeType === "وحدة").length;
  const noiseRatio = noisyCount / nodes.length;
  const unitRatio = unitCount / nodes.length;

  const childCount = nodes.filter((node) => node.parentId !== null).length;
  const legacyUnitOnlyDraft = nodes.length >= 4 && unitRatio >= 0.8 && childCount === 0;
  return noisyCount >= 3
    || noiseRatio >= 0.2
    || legacyUnitOnlyDraft
    || (nodes.length >= 15 && unitRatio >= 0.7);
}

export function validateSourceStructureDraft(nodes: SourceStructureNode[]): SourceStructureValidation {
  const issues: string[] = [];
  if (!nodes.length) issues.push("لا يوجد هيكل لحفظه.");
  if (!nodes.some((node) => node.nodeType === "وحدة")) issues.push("يجب أن يحتوي الهيكل على وحدة واحدة على الأقل.");
  const ids = new Set(nodes.map((node) => node.id));
  nodes.forEach((node) => {
    if (!node.title.trim()) issues.push("يوجد عنصر بلا عنوان.");
    if (looksLikeFormulaOrNoise(node.title)) issues.push(`العنوان يبدو معادلة أو نصًا مشوهًا: ${node.title}.`);
    if (!Number.isSafeInteger(node.pageStart) || node.pageStart < 1) issues.push(`صفحة البداية غير صالحة للعنصر: ${node.title || "بلا عنوان"}.`);
    if (!Number.isSafeInteger(node.pageEnd) || node.pageEnd < node.pageStart) issues.push(`نطاق الصفحات غير صالح للعنصر: ${node.title || "بلا عنوان"}.`);
    if (node.nodeType === "وحدة" && node.parentId !== null) issues.push(`الوحدة «${node.title}» لا يمكن أن تكون تابعة لوحدة أخرى.`);
    if (node.parentId && !ids.has(node.parentId)) issues.push(`العنصر «${node.title}» مرتبط بوحدة غير موجودة.`);
  });
  const duplicateKeys = new Set<string>();
  nodes.forEach((node) => {
    const key = `${node.parentId ?? "root"}|${node.nodeType}|${normalizedTitleKey(node.title)}`;
    if (duplicateKeys.has(key)) issues.push(`العنوان مكرر داخل المستوى نفسه: ${node.title}.`);
    duplicateKeys.add(key);
  });
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}

function lessonCodeParts(value: string): [number, number] | null {
  const normalized = normalizeArabicDigits(value);
  const match = normalized.match(/^(\d{1,2})\s*[-–—‑ـ_/:：.،\\|]\s*(\d{1,2})(?:\s|$)/);
  if (!match?.[1] || !match[2]) return null;
  return [Number(match[1]), Number(match[2])];
}

export function validateSourceStructureForApproval(nodes: SourceStructureNode[]): SourceStructureValidation {
  const issues = [...validateSourceStructureDraft(nodes).issues];
  const roots = nodes.filter((node) => node.nodeType === "وحدة" && node.parentId === null)
    .sort((left, right) => left.orderIndex - right.orderIndex);
  const automaticUnits = roots
    .filter((node) => node.extractionMethod.startsWith("toc-"))
    .map((node) => ({ node, ordinal: parseUnitOrdinal(node.title) }))
    .filter((item): item is { node: SourceStructureNode; ordinal: number } => item.ordinal !== null)
    .sort((left, right) => left.ordinal - right.ordinal);
  if (automaticUnits.length >= 2) {
    for (let index = 1; index < automaticUnits.length; index += 1) {
      const previous = automaticUnits[index - 1];
      const current = automaticUnits[index];
      if (previous && current && current.ordinal !== previous.ordinal + 1) {
        issues.push(`تسلسل الوحدات غير مكتمل بين الوحدة ${previous.ordinal} والوحدة ${current.ordinal}.`);
      }
    }
  }

  const globalPages: number[] = [];
  roots.forEach((root) => {
    const children = nodes.filter((node) => node.parentId === root.id)
      .sort((left, right) => left.orderIndex - right.orderIndex);
    if (!children.length) issues.push(`الوحدة «${root.title}» بلا دروس أو عناصر تابعة.`);
    children.forEach((child) => globalPages.push(child.pageStart));

    const lessonChildren = children.filter((child) => child.nodeType === "درس");
    const codes = lessonChildren.map((child) => lessonCodeParts(child.title));
    const rootOrdinal = parseUnitOrdinal(root.title);
    if (codes.some(Boolean)) {
      const seenCodes = new Set<string>();
      codes.forEach((code, index) => {
        if (!code) {
          issues.push(`درس في الوحدة «${root.title}» بلا رمز واضح.`);
          return;
        }
        const expectedLesson = index + 1;
        if (code[0] !== expectedLesson) issues.push(`تسلسل دروس الوحدة «${root.title}» ناقص عند الدرس ${expectedLesson}.`);
        if (rootOrdinal !== null && code[1] !== rootOrdinal) issues.push(`رمز الدرس ${code[0]}-${code[1]} لا يطابق رقم الوحدة «${root.title}».`);
        const key = `${code[0]}-${code[1]}`;
        if (seenCodes.has(key)) issues.push(`رمز الدرس مكرر داخل الوحدة «${root.title}»: ${key}.`);
        seenCodes.add(key);
      });
    }
  });
  for (let index = 1; index < globalPages.length; index += 1) {
    const previous = globalPages[index - 1] ?? 0;
    const current = globalPages[index] ?? 0;
    if (current < previous) {
      issues.push("أرقام صفحات الدروس ليست متصاعدة وفق ترتيب الهيكل.");
      break;
    }
  }
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}

export function validateSourceStructure(nodes: SourceStructureNode[]): SourceStructureValidation {
  return validateSourceStructureForApproval(nodes);
}

export function createManualStructureNode(
  sourceId: string,
  nodeType: SourceStructureNodeType,
  parentId: string | null,
  pageStart: number,
  orderIndex: number,
): SourceStructureNode {
  const now = new Date().toISOString();
  const id = `structure-manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    sourceId,
    parentId: nodeType === "وحدة" ? null : parentId,
    nodeType,
    title: nodeType === "وحدة" ? "وحدة جديدة" : "عنصر جديد",
    pageStart: Math.max(1, pageStart),
    pageEnd: Math.max(1, pageStart),
    orderIndex,
    confidence: 1,
    reviewStatus: "مرشح",
    extractionMethod: "manual",
    createdAt: now,
    updatedAt: now,
  };
}
