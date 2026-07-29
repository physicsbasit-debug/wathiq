import { layoutPageToColumns } from "./positional-toc.js";
import { resequenceStructureNodes } from "./source-structure.js";
import type { SourceOcrLayoutPage, SourceOcrLayoutWord, SourceStructureNode } from "./types.js";

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EXTRACTION_METHOD = "toc-review-builder-1";
const CODE_SEPARATOR_PATTERN = "[-–—‑ـ_/:：.،\\\\|]";
const UNIT_ORDINALS = new Map<string, number>([
  ["الاولى", 1], ["الاولي", 1], ["الثانيه", 2], ["الثالثه", 3], ["الرابعه", 4],
  ["الخامسه", 5], ["السادسه", 6], ["السابعه", 7], ["الثامنه", 8], ["التاسعه", 9],
  ["العاشره", 10], ["الحاديه عشره", 11], ["الثانيه عشره", 12],
]);

export type TocDraftRowType = "وحدة" | "درس" | "تجاهل";
export type TocDraftColumn = "يمين" | "يسار";

export interface TocDraftReferenceLine {
  id: string;
  sourcePage: number;
  sourceColumn: TocDraftColumn;
  text: string;
  yMin: number;
}

export interface TocDraftRow {
  id: string;
  rowType: TocDraftRowType;
  code: string;
  title: string;
  pageStart: number | null;
  sourcePage: number;
  sourceColumn: TocDraftColumn;
  sourceText: string;
  confidence: number;
  orderIndex: number;
}

export interface TocDraftBuildResult {
  rows: TocDraftRow[];
  referenceLines: TocDraftReferenceLine[];
  tocPages: number[];
  issues: string[];
  message: string;
}

export interface TocDraftConversionResult {
  nodes: SourceStructureNode[];
  issues: string[];
}

type LayoutLine = ReturnType<typeof layoutPageToColumns>["right"][number];

function normalizeDigits(value: string): string {
  return value.replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));
}

function normalizeArabic(value: string): string {
  return normalizeDigits(value)
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ـ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value: string): string {
  return value
    .replace(/[.…·•_]{2,}/g, " ")
    .replace(/[|]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[-–—:：.،؛\s]+|[-–—:：.،؛\s]+$/g, "")
    .trim();
}

function countArabicLetters(value: string): number {
  return (value.match(/[ء-ي]/g) ?? []).length;
}

function averageConfidence(words: SourceOcrLayoutWord[]): number {
  const values = words.flatMap((word) => typeof word.confidence === "number" ? [word.confidence] : []);
  if (!values.length) return 0.65;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function numericWordValue(word: SourceOcrLayoutWord): number | null {
  const normalized = normalizeDigits(word.text).trim();
  const match = normalized.match(/^[^0-9]*([0-9]{1,4})[^0-9]*$/);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value >= 1 && value <= 5000 ? value : null;
}

function wordCenterX(word: SourceOcrLayoutWord): number {
  return (word.xMin + word.xMax) / 2;
}

function unitOrdinalFromText(value: string): number | null {
  const normalized = normalizeArabic(value);
  const match = normalized.match(/الوحده\s+(.+?)(?:\s*[:：]|$)/);
  if (!match?.[1]) return null;
  const raw = match[1].trim();
  const numeric = raw.match(/^\d{1,2}$/);
  if (numeric?.[0]) return Number(numeric[0]);
  for (const [word, ordinal] of UNIT_ORDINALS.entries()) {
    if (raw === word || raw.startsWith(`${word} `)) return ordinal;
  }
  return null;
}

function extractLessonCode(value: string, words: SourceOcrLayoutWord[], unitOrdinal: number | null): string {
  const normalized = normalizeDigits(value);
  const explicit = normalized.match(new RegExp(`(^|\\s)(\\d{1,2})\\s*${CODE_SEPARATOR_PATTERN}+\\s*(\\d{1,2})(?=\\s|$)`));
  if (explicit?.[2] && explicit[3]) return `${Number(explicit[2])}-${Number(explicit[3])}`;

  const numericWords = [...words]
    .sort((left, right) => right.xMin - left.xMin)
    .map((word) => numericWordValue(word))
    .filter((value): value is number => value !== null && value <= 99)
    .slice(0, 4);
  for (let index = 0; index < numericWords.length - 1; index += 1) {
    const first = numericWords[index];
    const second = numericWords[index + 1];
    if (first === undefined || second === undefined) continue;
    if (unitOrdinal !== null && (first === unitOrdinal || second === unitOrdinal)) {
      return `${first}-${second}`;
    }
  }
  return "";
}

function extractPageNumber(line: LayoutLine, code: string): number | null {
  const codeParts = code.split("-").map(Number).filter((value) => Number.isSafeInteger(value));
  const candidates = line.words.flatMap((word) => {
    const value = numericWordValue(word);
    if (value === null || codeParts.includes(value)) return [];
    return [{ value, word }];
  });
  if (!candidates.length) return null;
  const leftmost = candidates.sort((left, right) => wordCenterX(left.word) - wordCenterX(right.word))[0];
  return leftmost?.value ?? null;
}

function stripCodeAndPage(value: string, code: string, pageStart: number | null): string {
  let title = normalizeDigits(value);
  if (code) {
    const [first, second] = code.split("-");
    if (first && second) {
      title = title.replace(new RegExp(`(^|\\s)${first}\\s*${CODE_SEPARATOR_PATTERN}+\\s*${second}(?=\\s|$)`), " ");
      title = title.replace(new RegExp(`^\\s*${first}\\s+${second}(?=\\s)`), " ");
    }
  }
  if (pageStart) {
    title = title.replace(new RegExp(`(^|\\s)${pageStart}(?=\\s|$)`), " ");
  }
  return cleanText(title).replace(/^[0-9\s-]+|[0-9\s-]+$/g, "").trim();
}

function isIgnoredLine(value: string): boolean {
  const normalized = normalizeArabic(value);
  return /^(?:المحتويات|الفهرس|مقدمه|كيف تستخدم هذا الكتاب|مصطلحات علميه|ملحق|شكر|حقوق|الناشر)/.test(normalized)
    || /(?:رقم الايداع|isbn|وزاره التعليم)/.test(normalized);
}

function meaningfulTitle(value: string): boolean {
  return countArabicLetters(value) >= 3 && value.length >= 4;
}

function makeRowId(pageNumber: number, column: TocDraftColumn, index: number): string {
  return `toc-draft-p${pageNumber}-${column === "يمين" ? "r" : "l"}-${index}`;
}

function makeReferenceId(pageNumber: number, column: TocDraftColumn, index: number): string {
  return `toc-ref-p${pageNumber}-${column === "يمين" ? "r" : "l"}-${index}`;
}

function buildColumnRows(
  lines: LayoutLine[],
  sourcePage: number,
  sourceColumn: TocDraftColumn,
  startOrder: number,
): TocDraftRow[] {
  const rows: TocDraftRow[] = [];
  let currentUnitOrdinal: number | null = null;
  let inferredLessonOrdinal = 1;
  let pendingTitle = "";
  let pendingSourceText = "";
  let pendingConfidence = 0.65;

  const pushLesson = (line: LayoutLine, code: string, pageStart: number | null, title: string, sourceText: string): void => {
    const resolvedCode = code || (currentUnitOrdinal !== null ? `${inferredLessonOrdinal}-${currentUnitOrdinal}` : "");
    const codeFirst = Number(resolvedCode.split("-")[0]);
    if (Number.isSafeInteger(codeFirst) && codeFirst > 0) inferredLessonOrdinal = codeFirst + 1;
    else inferredLessonOrdinal += 1;
    rows.push({
      id: makeRowId(sourcePage, sourceColumn, rows.length),
      rowType: "درس",
      code: resolvedCode,
      title: cleanText(title),
      pageStart,
      sourcePage,
      sourceColumn,
      sourceText,
      confidence: averageConfidence(line.words),
      orderIndex: startOrder + rows.length,
    });
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    const text = cleanText(line.text);
    if (!text || isIgnoredLine(text)) {
      pendingTitle = "";
      pendingSourceText = "";
      continue;
    }

    const unitOrdinal = unitOrdinalFromText(text);
    if (unitOrdinal !== null) {
      pendingTitle = "";
      pendingSourceText = "";
      currentUnitOrdinal = unitOrdinal;
      inferredLessonOrdinal = 1;
      rows.push({
        id: makeRowId(sourcePage, sourceColumn, rows.length),
        rowType: "وحدة",
        code: String(unitOrdinal),
        title: cleanText(text.replace(/\s+[0-9٠-٩]{1,4}\s*$/, "")),
        pageStart: null,
        sourcePage,
        sourceColumn,
        sourceText: text,
        confidence: averageConfidence(line.words),
        orderIndex: startOrder + rows.length,
      });
      continue;
    }

    const code = extractLessonCode(text, line.words, currentUnitOrdinal);
    const pageStart = extractPageNumber(line, code);
    const cleanedTitle = stripCodeAndPage(text, code, pageStart);

    const nextLine = lines[index + 1];
    const nextText = nextLine ? cleanText(nextLine.text) : "";
    const nextCode = nextLine ? extractLessonCode(nextText, nextLine.words, currentUnitOrdinal) : "";
    const nextPage = nextLine ? extractPageNumber(nextLine, nextCode) : null;

    if ((code || pageStart) && meaningfulTitle(cleanedTitle)) {
      if (code && !pageStart && nextPage && !nextCode) {
        pendingTitle = cleanText(`${pendingTitle} ${cleanedTitle}`);
        pendingSourceText = cleanText(`${pendingSourceText} ${text}`);
        pendingConfidence = averageConfidence(line.words);
        continue;
      }
      const title = cleanText(`${pendingTitle} ${cleanedTitle}`);
      const sourceText = cleanText(`${pendingSourceText} ${text}`);
      pushLesson(line, code, pageStart, title, sourceText);
      pendingTitle = "";
      pendingSourceText = "";
      continue;
    }

    if (meaningfulTitle(cleanedTitle)) {
      const lastUnitIndex = rows.map((row) => row.rowType).lastIndexOf("وحدة");
      const hasLessonAfterLastUnit = lastUnitIndex >= 0 && rows.slice(lastUnitIndex + 1).some((row) => row.rowType === "درس");
      if (lastUnitIndex >= 0 && !hasLessonAfterLastUnit && cleanedTitle.length <= 24 && !pageStart && !code) {
        const lastUnit = rows[lastUnitIndex];
        if (lastUnit) lastUnit.title = cleanText(`${lastUnit.title} ${cleanedTitle}`);
        continue;
      }

      if (nextPage || nextCode) {
        pendingTitle = cleanText(`${pendingTitle} ${cleanedTitle}`);
        pendingSourceText = cleanText(`${pendingSourceText} ${text}`);
        pendingConfidence = averageConfidence(line.words);
        continue;
      }

      rows.push({
        id: makeRowId(sourcePage, sourceColumn, rows.length),
        rowType: "تجاهل",
        code: "",
        title: cleanedTitle,
        pageStart: null,
        sourcePage,
        sourceColumn,
        sourceText: text,
        confidence: pendingConfidence,
        orderIndex: startOrder + rows.length,
      });
    }
  }

  return rows;
}

function draftIssues(rows: TocDraftRow[]): string[] {
  const issues: string[] = [];
  const activeRows = rows.filter((row) => row.rowType !== "تجاهل");
  const units = activeRows.filter((row) => row.rowType === "وحدة");
  const lessons = activeRows.filter((row) => row.rowType === "درس");
  if (!units.length) issues.push("لم يُكتشف أي صف وحدة؛ صنّف صفًا واحدًا على الأقل كوحدة.");
  if (!lessons.length) issues.push("لم يُكتشف أي صف درس؛ صنّف صفوف الدروس قبل الحفظ.");
  let currentUnit: TocDraftRow | null = null;
  for (const row of activeRows) {
    if (!row.title.trim()) issues.push("يوجد صف بلا عنوان.");
    if (row.rowType === "وحدة") {
      currentUnit = row;
      continue;
    }
    if (!currentUnit) issues.push(`الدرس «${row.title || "بلا عنوان"}» يسبق أول وحدة.`);
    if (!Number.isSafeInteger(row.pageStart) || (row.pageStart ?? 0) < 1) issues.push(`صفحة الدرس «${row.title || "بلا عنوان"}» غير محددة.`);
  }
  return [...new Set(issues)];
}

export function buildTocDraft(pages: SourceOcrLayoutPage[]): TocDraftBuildResult {
  const sortedPages = [...pages].sort((left, right) => left.pageNumber - right.pageNumber);
  const rows: TocDraftRow[] = [];
  const referenceLines: TocDraftReferenceLine[] = [];

  for (const page of sortedPages) {
    const columns = layoutPageToColumns(page);
    const columnEntries: Array<{ column: TocDraftColumn; lines: LayoutLine[] }> = [
      { column: "يمين", lines: columns.right },
      { column: "يسار", lines: columns.left },
    ];
    for (const entry of columnEntries) {
      entry.lines.forEach((line, index) => {
        const text = cleanText(line.text);
        if (!text) return;
        referenceLines.push({
          id: makeReferenceId(page.pageNumber, entry.column, index),
          sourcePage: page.pageNumber,
          sourceColumn: entry.column,
          text,
          yMin: line.yMin,
        });
      });
      rows.push(...buildColumnRows(entry.lines, page.pageNumber, entry.column, rows.length));
    }
  }

  const resequencedRows = rows.map((row, orderIndex) => ({ ...row, orderIndex }));
  const issues = draftIssues(resequencedRows);
  const unitCount = resequencedRows.filter((row) => row.rowType === "وحدة").length;
  const lessonCount = resequencedRows.filter((row) => row.rowType === "درس").length;
  const ignoredCount = resequencedRows.filter((row) => row.rowType === "تجاهل").length;
  return {
    rows: resequencedRows,
    referenceLines,
    tocPages: sortedPages.map((page) => page.pageNumber),
    issues,
    message: `جهّز واثق مسودة مراجعة من ${unitCount} وحدة و${lessonCount} درسًا، مع ${ignoredCount} صف غير مصنف. لم تُحفظ أي نتيجة بعد.`,
  };
}

export function splitStructureTitle(value: string): { code: string; title: string } {
  const cleaned = cleanText(normalizeDigits(value));
  const match = cleaned.match(new RegExp(`^(\\d{1,2}\\s*${CODE_SEPARATOR_PATTERN}+\\s*\\d{1,2})\\s+(.+)$`));
  if (!match?.[1] || !match[2]) return { code: "", title: cleaned };
  const code = match[1].replace(new RegExp(CODE_SEPARATOR_PATTERN, "g"), "-").replace(/\s+/g, "");
  return { code, title: cleanText(match[2]) };
}

export function composeStructureTitle(code: string, title: string): string {
  const cleanedTitle = cleanText(title);
  const cleanedCode = normalizeDigits(code).replace(/\s+/g, "").replace(new RegExp(CODE_SEPARATOR_PATTERN, "g"), "-");
  return cleanText(`${cleanedCode} ${cleanedTitle}`);
}

export function convertTocDraftRows(sourceId: string, rows: TocDraftRow[], totalPages: number): TocDraftConversionResult {
  const ordered = [...rows].sort((left, right) => left.orderIndex - right.orderIndex);
  const issues = draftIssues(ordered);
  const now = new Date().toISOString();
  const nodes: SourceStructureNode[] = [];
  let currentUnitId: string | null = null;

  for (const row of ordered) {
    if (row.rowType === "تجاهل") continue;
    if (!row.title.trim()) continue;
    if (row.rowType === "وحدة") {
      currentUnitId = `structure-review-${row.id}`;
      nodes.push({
        id: currentUnitId,
        sourceId,
        parentId: null,
        nodeType: "وحدة",
        title: cleanText(row.title),
        pageStart: 1,
        pageEnd: 1,
        orderIndex: nodes.length,
        confidence: row.confidence,
        reviewStatus: "مرشح",
        extractionMethod: EXTRACTION_METHOD,
        createdAt: now,
        updatedAt: now,
      });
      continue;
    }
    if (!currentUnitId) continue;
    const pageStart = Number.isSafeInteger(row.pageStart) && (row.pageStart ?? 0) > 0 ? row.pageStart as number : 1;
    nodes.push({
      id: `structure-review-${row.id}`,
      sourceId,
      parentId: currentUnitId,
      nodeType: "درس",
      title: composeStructureTitle(row.code, row.title),
      pageStart,
      pageEnd: pageStart,
      orderIndex: nodes.length,
      confidence: row.confidence,
      reviewStatus: "مرشح",
      extractionMethod: EXTRACTION_METHOD,
      createdAt: now,
      updatedAt: now,
    });
  }

  const roots = nodes.filter((node) => node.parentId === null);
  roots.forEach((root, rootIndex) => {
    const children = nodes.filter((node) => node.parentId === root.id);
    const firstPage = children[0]?.pageStart ?? Math.max(1, rootIndex === 0 ? 1 : (roots[rootIndex - 1]?.pageEnd ?? 1) + 1);
    root.pageStart = firstPage;
    const nextRootFirstPage = nodes.find((node) => node.parentId === roots[rootIndex + 1]?.id)?.pageStart;
    root.pageEnd = Math.max(root.pageStart, (nextRootFirstPage ?? (totalPages + 1)) - 1);
    children.forEach((child, childIndex) => {
      const nextChild = children[childIndex + 1];
      child.pageEnd = Math.max(child.pageStart, (nextChild?.pageStart ?? (root.pageEnd + 1)) - 1);
    });
  });

  return { nodes: resequenceStructureNodes(nodes), issues };
}

export function createEmptyTocDraftRow(type: "وحدة" | "درس", orderIndex: number): TocDraftRow {
  return {
    id: `toc-draft-manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    rowType: type,
    code: "",
    title: type === "وحدة" ? "وحدة جديدة" : "درس جديد",
    pageStart: type === "درس" ? 1 : null,
    sourcePage: 0,
    sourceColumn: "يمين",
    sourceText: "إضافة يدوية",
    confidence: 1,
    orderIndex,
  };
}
