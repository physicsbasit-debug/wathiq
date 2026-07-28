import type {
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

const STRUCTURE_VERSION = "toc-heuristic-1";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EXCLUDED_TITLE_PATTERN = /(?:حقوق\s+(?:الطبع|الطباعة|النشر)|الطبعة\s+(?:التجريبية|الأولى|الثانية|الثالثة)|الرقم\s+الدولي|ISBN|الفهرس|المحتويات|مقدمة\s+الكتاب|شكر\s+وتقدير|المؤلف(?:ون|ين)?|وزارة\s+(?:التربية|التعليم)|مطبعة\s+جامعة|بيانات\s+النشر)/i;
const TOC_HEADER_PATTERN = /^(?:الفهرس|المحتويات|محتويات\s+الكتاب|قائمة\s+المحتويات|contents?)\s*$/i;
const UNIT_PATTERN = /^(?:الوحدة|وحدة)\s+(?:الأولى|الثانية|الثالثة|الرابعة|الخامسة|السادسة|السابعة|الثامنة|التاسعة|العاشرة|\d+|[٠-٩]+)/i;
const LESSON_PATTERN = /^(?:الدرس|درس)\s+(?:الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|\d+|[٠-٩]+)/i;
const TOPIC_PATTERN = /^(?:الفصل|الموضوع|موضوع)\b/i;
const ACTIVITY_PATTERN = /^(?:نشاط|نشاط\s+عملي|تجربة|استقصاء|مختبر|عمل\s+مخبري)\b/i;
const REVIEW_PATTERN = /^(?:مراجعة|ملخص|خلاصة)\b/i;
const QUESTIONS_PATTERN = /^(?:أسئلة|تقويم|تمارين|اختبر\s+نفسك|أسئلة\s+الوحدة)\b/i;
const NUMBERED_SUBSECTION_PATTERN = /^([0-9٠-٩]+(?:[.٫][0-9٠-٩]+)+)\s*[-–—:]?\s*(.+)$/;
const NUMBERED_UNIT_PATTERN = /^([0-9٠-٩]+)(?:\s*[-–—:]\s*|\s+)(.+)$/;

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

function nodeTypeForTitle(title: string): { nodeType: SourceStructureNodeType; confidence: number } | null {
  if (UNIT_PATTERN.test(title)) return { nodeType: "وحدة", confidence: 0.97 };
  if (LESSON_PATTERN.test(title)) return { nodeType: "درس", confidence: 0.94 };
  if (ACTIVITY_PATTERN.test(title)) return { nodeType: "نشاط", confidence: 0.91 };
  if (REVIEW_PATTERN.test(title)) return { nodeType: "مراجعة", confidence: 0.91 };
  if (QUESTIONS_PATTERN.test(title)) return { nodeType: "أسئلة", confidence: 0.91 };
  if (TOPIC_PATTERN.test(title)) return { nodeType: "موضوع", confidence: 0.88 };
  const subsection = title.match(NUMBERED_SUBSECTION_PATTERN);
  if (subsection?.[2]) return { nodeType: "درس", confidence: 0.86 };
  const numberedUnit = title.match(NUMBERED_UNIT_PATTERN);
  if (numberedUnit?.[2]) return { nodeType: "وحدة", confidence: 0.78 };
  return null;
}

function titleIsExcluded(title: string): boolean {
  const normalized = cleanStructureTitle(title);
  return normalized.length < 3 || normalized.length > 180 || EXCLUDED_TITLE_PATTERN.test(normalized);
}

function parseInlineTocLine(line: string, sourcePage: number): ParsedCandidate | null {
  const raw = line.replace(/\s+/g, " ").trim();
  if (!raw || TOC_HEADER_PATTERN.test(cleanStructureTitle(raw))) return null;
  const leading = raw.match(/^([0-9٠-٩]{1,4})\s+((?:الوحدة|وحدة|الدرس|درس|الفصل|الموضوع|موضوع|نشاط|تجربة|استقصاء|مختبر|مراجعة|ملخص|أسئلة|تقويم|تمارين|اختبر\s+نفسك).{2,165})$/i);
  const dotted = raw.match(/^(.*?)(?:\s*[.…·•_]{2,}\s*)([0-9٠-٩]{1,4})\s*$/);
  const spaced = dotted ?? raw.match(/^((?:الوحدة|وحدة|الدرس|درس|الفصل|الموضوع|موضوع|نشاط|تجربة|استقصاء|مختبر|مراجعة|ملخص|أسئلة|تقويم|تمارين|اختبر\s+نفسك|[0-9٠-٩]+(?:[.٫][0-9٠-٩]+)+).{2,155}?)\s+([0-9٠-٩]{1,4})\s*$/i);
  const rawTitle = leading?.[2] ?? spaced?.[1];
  const rawPage = leading?.[1] ?? spaced?.[2];
  if (!rawTitle || !rawPage) return null;
  const title = cleanStructureTitle(rawTitle);
  const pageStart = parsePageNumber(rawPage);
  const typed = nodeTypeForTitle(title);
  if (!pageStart || !typed || titleIsExcluded(title)) return null;
  return {
    nodeType: typed.nodeType,
    title,
    pageStart,
    sourcePage,
    confidence: Math.min(0.99, typed.confidence + 0.01),
    fromToc: true,
  };
}

function parseTocPage(page: SourcePageText): ParsedCandidate[] {
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
    const typed = nodeTypeForTitle(line);
    const nextPage = nextLine ? parsePageNumber(nextLine) : null;
    if (typed && nextPage && !titleIsExcluded(line)) {
      entries.push({
        nodeType: typed.nodeType,
        title: line,
        pageStart: nextPage,
        sourcePage: page.pageNumber,
        confidence: typed.confidence,
        fromToc: true,
      });
      index += 1;
    }
  }
  return entries;
}

function tocPageScore(page: SourcePageText, entries: ParsedCandidate[]): number {
  const hasHeader = page.content.split(/\n+/).some((line) => TOC_HEADER_PATTERN.test(cleanStructureTitle(line)));
  const uniqueTypes = new Set(entries.map((entry) => entry.nodeType)).size;
  return entries.length * 3 + uniqueTypes * 2 + (hasHeader ? 8 : 0);
}

function parseFallbackHeadings(pages: SourcePageText[]): ParsedCandidate[] {
  const candidates: ParsedCandidate[] = [];
  for (const page of pages) {
    const lines = page.content.split(/\n+/).map(cleanStructureTitle).filter(Boolean).slice(0, 35);
    for (const line of lines) {
      const typed = nodeTypeForTitle(line);
      if (!typed || titleIsExcluded(line)) continue;
      candidates.push({
        nodeType: typed.nodeType,
        title: line,
        pageStart: page.pageNumber,
        sourcePage: page.pageNumber,
        confidence: Math.max(0.58, typed.confidence - 0.22),
        fromToc: false,
      });
    }
  }
  return candidates;
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

function buildNodes(sourceId: string, candidates: ParsedCandidate[], totalPages: number): SourceStructureNode[] {
  const nodes: SourceStructureNode[] = [];
  let currentUnitId: string | null = null;
  const now = new Date().toISOString();
  candidates.forEach((candidate, index) => {
    const id = `structure-${stableHash(`${sourceId}|${candidate.nodeType}|${normalizedTitleKey(candidate.title)}|${candidate.pageStart}`)}`;
    const parentId = candidate.nodeType === "وحدة" ? null : currentUnitId;
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
      extractionMethod: candidate.fromToc ? STRUCTURE_VERSION : `${STRUCTURE_VERSION}-fallback`,
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

export function extractSourceStructure(
  sourceId: string,
  chunks: SourceTextChunk[],
  totalPages: number,
): SourceStructureExtractionResult {
  const pages = chunksToPageTexts(chunks);
  const pageAnalyses = pages.map((page) => ({ page, entries: parseTocPage(page) }));
  const strongTocPages = pageAnalyses.filter(({ page, entries }) => tocPageScore(page, entries) >= 13 && entries.length >= 2);
  const tocPageNumbers = strongTocPages.map(({ page }) => page.pageNumber);
  const tocCandidates = strongTocPages.flatMap(({ entries }) => entries);
  const fallbackCandidates = tocCandidates.length >= 2 ? [] : parseFallbackHeadings(pages);
  const candidates = deduplicateCandidates(tocCandidates.length >= 2 ? tocCandidates : fallbackCandidates);
  const nodes = buildNodes(sourceId, candidates, totalPages || pages.at(-1)?.pageNumber || 1);
  const unitCount = nodes.filter((node) => node.nodeType === "وحدة").length;
  const childCount = nodes.length - unitCount;
  return {
    sourceId,
    nodes,
    tocPages: tocPageNumbers,
    usedFallback: tocCandidates.length < 2,
    message: nodes.length
      ? `استخرج واثق ${unitCount} وحدة و${childCount} عنصرًا تابعًا${tocPageNumbers.length ? ` من صفحات الفهرس ${tocPageNumbers.join("، ")}` : " من عناوين الصفحات"}.`
      : "لم يعثر واثق على فهرس أو عناوين تعليمية واضحة؛ أضف الهيكل يدويًا أو راجع جودة النص.",
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

export function validateSourceStructure(nodes: SourceStructureNode[]): SourceStructureValidation {
  const issues: string[] = [];
  if (!nodes.length) issues.push("لا يوجد هيكل لاعتماده.");
  if (!nodes.some((node) => node.nodeType === "وحدة")) issues.push("يجب أن يحتوي الهيكل على وحدة واحدة على الأقل.");
  const ids = new Set(nodes.map((node) => node.id));
  nodes.forEach((node) => {
    if (!node.title.trim()) issues.push("يوجد عنصر بلا عنوان.");
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
