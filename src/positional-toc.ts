import { chunksToPageTexts, resequenceStructureNodes } from "./source-structure.js";
import type {
  SourceOcrLayoutPage,
  SourceOcrLayoutWord,
  SourceStructureExtractionResult,
  SourceStructureNode,
  SourceTextChunk,
} from "./types.js";

const EXTRACTION_METHOD = "toc-positional-vision-1";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const UNIT_ORDINALS = new Map<string, number>([
  ["الاولى", 1], ["الاولي", 1], ["الثانيه", 2], ["الثالثه", 3], ["الرابعه", 4],
  ["الخامسه", 5], ["السادسه", 6], ["السابعه", 7], ["الثامنه", 8], ["التاسعه", 9],
  ["العاشره", 10], ["الحاديه عشره", 11], ["الثانيه عشره", 12],
]);

interface LayoutLine {
  words: SourceOcrLayoutWord[];
  text: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

interface ParsedUnit {
  ordinal: number;
  title: string;
  lessons: ParsedLesson[];
  confidence: number;
}

interface ParsedLesson {
  unitOrdinal: number;
  lessonOrdinal: number;
  title: string;
  pageStart: number;
  confidence: number;
}

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

function wordCenterX(word: SourceOcrLayoutWord): number {
  return (word.xMin + word.xMax) / 2;
}

function wordCenterY(word: SourceOcrLayoutWord): number {
  return (word.yMin + word.yMax) / 2;
}

function verticalOverlap(left: SourceOcrLayoutWord, line: LayoutLine): number {
  const overlap = Math.max(0, Math.min(left.yMax, line.yMax) - Math.max(left.yMin, line.yMin));
  const height = Math.max(1, Math.min(left.yMax - left.yMin, line.yMax - line.yMin));
  return overlap / height;
}

function buildLine(words: SourceOcrLayoutWord[]): LayoutLine {
  const ordered = [...words].sort((left, right) => right.xMin - left.xMin);
  return {
    words: ordered,
    text: cleanText(ordered.map((word) => word.text).join(" ")),
    xMin: Math.min(...ordered.map((word) => word.xMin)),
    xMax: Math.max(...ordered.map((word) => word.xMax)),
    yMin: Math.min(...ordered.map((word) => word.yMin)),
    yMax: Math.max(...ordered.map((word) => word.yMax)),
  };
}

function groupColumnWords(words: SourceOcrLayoutWord[]): LayoutLine[] {
  const ordered = [...words].sort((left, right) => wordCenterY(left) - wordCenterY(right) || right.xMin - left.xMin);
  const lines: LayoutLine[] = [];
  for (const word of ordered) {
    const height = Math.max(1, word.yMax - word.yMin);
    let candidateIndex = -1;
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (!line) continue;
      const lineHeight = Math.max(1, line.yMax - line.yMin);
      if (verticalOverlap(word, line) >= 0.3
        || Math.abs(wordCenterY(word) - ((line.yMin + line.yMax) / 2)) <= Math.max(height, lineHeight) * 0.52) {
        candidateIndex = index;
        break;
      }
    }
    if (candidateIndex < 0) {
      lines.push(buildLine([word]));
      continue;
    }
    const candidate = lines[candidateIndex];
    if (!candidate) continue;
    lines[candidateIndex] = buildLine([...candidate.words, word]);
  }
  return lines.sort((left, right) => left.yMin - right.yMin || right.xMin - left.xMin);
}

export function layoutPageToColumns(page: SourceOcrLayoutPage): { right: LayoutLine[]; left: LayoutLine[] } {
  const mid = page.width / 2;
  const gutter = Math.max(12, page.width * 0.018);
  const valid = page.words.filter((word) => (cleanText(word.text) || /[-–—‑]/.test(word.text)) && word.xMax > word.xMin && word.yMax > word.yMin);
  const rightWords = valid.filter((word) => wordCenterX(word) >= mid - gutter);
  const leftWords = valid.filter((word) => wordCenterX(word) < mid - gutter);
  return { right: groupColumnWords(rightWords), left: groupColumnWords(leftWords) };
}

function unitOrdinalFromText(value: string): number | null {
  const normalized = normalizeArabic(value);
  const match = normalized.match(/الوحده\s+(.+?)(?:\s*[:：]|$)/);
  if (!match?.[1]) return null;
  const raw = match[1].trim();
  const numeric = raw.match(/^\d{1,2}$/);
  if (numeric) return Number(numeric[0]);
  for (const [word, ordinal] of UNIT_ORDINALS.entries()) {
    if (raw === word || raw.startsWith(`${word} `)) return ordinal;
  }
  return null;
}

function isUnitLine(line: LayoutLine): boolean {
  return /الوحد[هة]\s+/.test(normalizeArabic(line.text)) && unitOrdinalFromText(line.text) !== null;
}

const CODE_SEPARATOR_PATTERN = "[-–—‑ـ_/:：.،\\\\|]";

function codeMatch(value: string): RegExpMatchArray | null {
  return normalizeDigits(value).match(new RegExp(`(^|\\s)(\\d{1,2})\\s*${CODE_SEPARATOR_PATTERN}+\\s*(\\d{1,2})(?=\\s|$)`));
}

function numericWordValue(word: SourceOcrLayoutWord): number | null {
  const normalized = normalizeDigits(word.text).trim();
  const match = normalized.match(/^[^0-9]*([0-9]{1,4})[^0-9]*$/);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value >= 1 && value <= 5000 ? value : null;
}

function purePageNumbers(line: LayoutLine): Array<{ value: number; word: SourceOcrLayoutWord }> {
  return line.words.flatMap((word) => {
    const value = numericWordValue(word);
    return value === null ? [] : [{ value, word }];
  }).sort((left, right) => left.word.xMin - right.word.xMin);
}

function lessonOrdinalFromLine(line: LayoutLine, unitOrdinal: number): number | null {
  const matched = codeMatch(line.text);
  if (matched?.[2] && matched[3]) {
    const first = Number(matched[2]);
    const second = Number(matched[3]);
    if (second === unitOrdinal && first >= 1 && first <= 99) return first;
    if (first === unitOrdinal && second >= 1 && second <= 99) return second;
  }

  // بعض نتائج Vision تفصل رقمي الرمز إلى كلمتين وتحذف الشرطة بينهما.
  // نستبعد الرقم الواقع أقصى اليسار لأنه رقم الصفحة، ثم نقرأ الأرقام من جهة رمز الدرس.
  const pageWord = purePageNumbers(line)[0]?.word;
  const codeNumbers = line.words
    .filter((word) => word !== pageWord)
    .map((word) => numericWordValue(word))
    .filter((value): value is number => value !== null && value <= 99)
    .slice(0, 4);
  for (let index = 0; index < codeNumbers.length - 1; index += 1) {
    const first = codeNumbers[index];
    const second = codeNumbers[index + 1];
    if (first === undefined || second === undefined) continue;
    if (second === unitOrdinal && first >= 1) return first;
    if (first === unitOrdinal && second >= 1) return second;
  }
  return null;
}

function extractPageNumber(line: LayoutLine, unitOrdinal: number, lessonOrdinal: number | null): number | null {
  const span = Math.max(1, line.xMax - line.xMin);
  const candidates = purePageNumbers(line).filter((candidate) => (
    candidate.value !== unitOrdinal && candidate.value !== lessonOrdinal
  ));
  const positional = candidates.find((candidate) => {
    const relativeCenter = (wordCenterX(candidate.word) - line.xMin) / span;
    return relativeCenter <= 0.38;
  });
  if (positional) return positional.value;

  if (lessonOrdinal !== null) {
    const normalized = normalizeDigits(line.text);
    const stripped = normalized.replace(
      new RegExp(`\\d{1,2}\\s*${CODE_SEPARATOR_PATTERN}+\\s*\\d{1,2}`),
      " ",
    );
    const matches = [...stripped.matchAll(/\\b(\\d{1,4})\\b/g)]
      .map((match) => Number(match[1]))
      .filter((value) => value > 0 && value <= 5000 && value !== unitOrdinal && value !== lessonOrdinal);
    return matches.at(-1) ?? null;
  }
  return null;
}

function cleanUnitTitle(value: string): string {
  return cleanText(value)
    .replace(/\s+[0-9٠-٩]{1,4}\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanLessonTitle(value: string, unitOrdinal: number, lessonOrdinal: number, pageNumber: number | null): string {
  let title = normalizeDigits(value);
  const separator = `${CODE_SEPARATOR_PATTERN}+`;
  title = title.replace(new RegExp(`(^|\\s)${lessonOrdinal}\\s*${separator}\\s*${unitOrdinal}(?=\\s|$)`), " ");
  title = title.replace(new RegExp(`(^|\\s)${unitOrdinal}\\s*${separator}\\s*${lessonOrdinal}(?=\\s|$)`), " ");
  // Vision قد يعيد رقمي الرمز منفصلين من دون الشرطة؛ نحذفهما من بداية السطر فقط.
  title = title.replace(/^\\s*\\d{1,2}\\s+\\d{1,2}(?=\\s)/, " ");
  if (pageNumber) {
    title = title.replace(new RegExp(`(^|\\s)${pageNumber}(?=\\s|$)`), " ");
  }
  return cleanText(title)
    .replace(/^[0-9\s\-–—‑ـ_/:：.،\\|]+|[0-9\s\-–—‑ـ_/:：.،\\|]+$/g, "")
    .trim();
}

function meaningfulArabicTitle(value: string): boolean {
  const cleaned = cleanText(value);
  const arabicLetters = (cleaned.match(/[\u0600-\u06FF]/g) ?? []).length;
  const latinLetters = (cleaned.match(/[A-Za-z]/g) ?? []).length;
  const symbols = (cleaned.match(/[=+×÷ΩµλγΔΣπ^<>()[\]{}]/g) ?? []).length;
  return cleaned.length >= 3 && arabicLetters >= 3 && latinLetters + symbols <= Math.max(3, arabicLetters * 0.35);
}

function lineContinuationText(line: LayoutLine): string {
  const numbers = purePageNumbers(line);
  let text = normalizeDigits(line.text);
  for (const candidate of numbers) text = text.replace(new RegExp(`(^|\\s)${candidate.value}(?=\\s|$)`), " ");
  return cleanText(text);
}

function averageConfidence(words: SourceOcrLayoutWord[]): number {
  const values = words.map((word) => word.confidence).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) return 0.9;
  return Math.max(0, Math.min(1, values.reduce((sum, value) => sum + value, 0) / values.length));
}

function isIgnoredNonLessonLine(value: string): boolean {
  const normalized = normalizeArabic(value);
  return /^(?:مصطلحات علميه|ملحق|المراجعه|اسئله المراجعه|اجابات|قاموس|الفهرس|المحتويات)/.test(normalized);
}

function nextExpectedLessonOrdinal(unit: ParsedUnit): number {
  return unit.lessons.reduce((maximum, lesson) => Math.max(maximum, lesson.lessonOrdinal), 0) + 1;
}

function parseColumn(lines: LayoutLine[]): ParsedUnit[] {
  const units: ParsedUnit[] = [];
  let currentUnit: ParsedUnit | null = null;
  let pendingLesson: {
    lessonOrdinal: number;
    title: string;
    pageStart: number | null;
    words: SourceOcrLayoutWord[];
  } | null = null;

  const finalizeLesson = (): void => {
    if (!currentUnit || !pendingLesson || !pendingLesson.pageStart || !meaningfulArabicTitle(pendingLesson.title)) {
      pendingLesson = null;
      return;
    }
    const key = `${currentUnit.ordinal}-${pendingLesson.lessonOrdinal}`;
    if (!currentUnit.lessons.some((lesson) => `${lesson.unitOrdinal}-${lesson.lessonOrdinal}` === key)) {
      currentUnit.lessons.push({
        unitOrdinal: currentUnit.ordinal,
        lessonOrdinal: pendingLesson.lessonOrdinal,
        title: cleanText(pendingLesson.title),
        pageStart: pendingLesson.pageStart,
        confidence: averageConfidence(pendingLesson.words),
      });
      currentUnit.lessons.sort((left, right) => left.lessonOrdinal - right.lessonOrdinal);
    }
    pendingLesson = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    const text = cleanText(line.text);
    if (!text || /^(?:المحتويات|المقدمه|كيف تستخدم هذا الكتاب)/.test(normalizeArabic(text))) continue;

    if (isUnitLine(line)) {
      finalizeLesson();
      const ordinal = unitOrdinalFromText(text);
      if (!ordinal) continue;
      const title = cleanUnitTitle(text);
      const existing = units.find((unit) => unit.ordinal === ordinal);
      currentUnit = existing ?? { ordinal, title, lessons: [], confidence: averageConfidence(line.words) };
      if (!existing) units.push(currentUnit);
      else if (title.length > existing.title.length) existing.title = title;
      continue;
    }

    if (!currentUnit) continue;
    if (isIgnoredNonLessonLine(text)) {
      finalizeLesson();
      continue;
    }

    const explicitLessonOrdinal = lessonOrdinalFromLine(line, currentUnit.ordinal);
    if (explicitLessonOrdinal !== null) {
      finalizeLesson();
      const pageNumber = extractPageNumber(line, currentUnit.ordinal, explicitLessonOrdinal);
      pendingLesson = {
        lessonOrdinal: explicitLessonOrdinal,
        title: cleanLessonTitle(text, currentUnit.ordinal, explicitLessonOrdinal, pageNumber),
        pageStart: pageNumber,
        words: [...line.words],
      };
      if (pageNumber && meaningfulArabicTitle(pendingLesson.title)) finalizeLesson();
      continue;
    }

    if (pendingLesson) {
      const pageNumber = extractPageNumber(line, currentUnit.ordinal, null);
      const continuation = lineContinuationText(line);
      if (meaningfulArabicTitle(continuation)) {
        pendingLesson.title = cleanText(`${pendingLesson.title} ${continuation}`);
      }
      if (!pendingLesson.pageStart && pageNumber) pendingLesson.pageStart = pageNumber;
      pendingLesson.words.push(...line.words);
      if (pendingLesson.pageStart && meaningfulArabicTitle(pendingLesson.title)) finalizeLesson();
      continue;
    }

    const expectedOrdinal = nextExpectedLessonOrdinal(currentUnit);
    const inferredPageNumber = extractPageNumber(line, currentUnit.ordinal, null);
    const inferredTitle = cleanLessonTitle(text, currentUnit.ordinal, expectedOrdinal, inferredPageNumber);

    // الاسترداد المكاني: صف عربي ينتهي برقم صفحة داخل نطاق الوحدة يُعد درسًا
    // حتى لو حذف Vision رمز الدرس أو شوّهه بالكامل.
    if (inferredPageNumber && meaningfulArabicTitle(inferredTitle)) {
      pendingLesson = {
        lessonOrdinal: expectedOrdinal,
        title: inferredTitle,
        pageStart: inferredPageNumber,
        words: [...line.words],
      };
      finalizeLesson();
      continue;
    }

    const continuation = lineContinuationText(line);
    if (!meaningfulArabicTitle(continuation)) continue;

    const nextLine = lines[index + 1];
    const nextIsUnit = Boolean(nextLine && isUnitLine(nextLine));
    const nextExplicitOrdinal = nextLine ? lessonOrdinalFromLine(nextLine, currentUnit.ordinal) : null;
    const nextPageNumber = nextLine && !nextIsUnit
      ? extractPageNumber(nextLine, currentUnit.ordinal, nextExplicitOrdinal)
      : null;

    // عناوين الوحدات قد تلتف إلى سطر قصير مثل «النصف».
    if (currentUnit.lessons.length === 0 && continuation.length <= 20) {
      currentUnit.title = cleanText(`${currentUnit.title} ${continuation}`);
      continue;
    }

    // عنوان درس ملتف: السطر الأول يحمل العنوان، والسطر التالي يحمل بقية العنوان ورقم الصفحة.
    if (!nextIsUnit && nextExplicitOrdinal === null && nextPageNumber) {
      pendingLesson = {
        lessonOrdinal: expectedOrdinal,
        title: continuation,
        pageStart: null,
        words: [...line.words],
      };
      continue;
    }

    // قبل أول درس فقط، السطر العربي القصير بلا صفحة ولا رمز هو امتداد لعنوان الوحدة.
    if (currentUnit.lessons.length === 0) {
      currentUnit.title = cleanText(`${currentUnit.title} ${continuation}`);
    }
  }
  finalizeLesson();
  return units;
}

function mergeUnits(groups: ParsedUnit[][]): ParsedUnit[] {
  const byOrdinal = new Map<number, ParsedUnit>();
  for (const group of groups) {
    for (const unit of group) {
      const existing = byOrdinal.get(unit.ordinal);
      if (!existing) {
        byOrdinal.set(unit.ordinal, { ...unit, lessons: [...unit.lessons] });
        continue;
      }
      if (unit.title.length > existing.title.length) existing.title = unit.title;
      existing.confidence = Math.max(existing.confidence, unit.confidence);
      for (const lesson of unit.lessons) {
        const index = existing.lessons.findIndex((item) => item.lessonOrdinal === lesson.lessonOrdinal);
        if (index < 0) existing.lessons.push(lesson);
        else if ((existing.lessons[index]?.title.length ?? 0) < lesson.title.length) existing.lessons[index] = lesson;
      }
    }
  }
  return [...byOrdinal.values()]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((unit) => ({ ...unit, lessons: [...unit.lessons].sort((left, right) => left.lessonOrdinal - right.lessonOrdinal) }));
}

function validateParsedUnits(units: ParsedUnit[]): string[] {
  const issues: string[] = [];
  if (units.length < 2) issues.push("لم يُستخرج عدد كافٍ من الوحدات من الفهرس البصري.");
  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];
    if (!unit) continue;
    if (unit.ordinal !== index + 1) issues.push(`تسلسل الوحدات ناقص؛ المتوقع الوحدة ${index + 1} وظهر ${unit.ordinal}.`);
    if (!meaningfulArabicTitle(unit.title)) issues.push(`عنوان الوحدة ${unit.ordinal} غير واضح.`);
    if (!unit.lessons.length) issues.push(`الوحدة ${unit.ordinal} بلا دروس مستخرجة.`);
    for (let lessonIndex = 0; lessonIndex < unit.lessons.length; lessonIndex += 1) {
      const lesson = unit.lessons[lessonIndex];
      if (!lesson) continue;
      if (lesson.lessonOrdinal !== lessonIndex + 1) issues.push(`تسلسل دروس الوحدة ${unit.ordinal} ناقص عند الدرس ${lessonIndex + 1}.`);
      if (!meaningfulArabicTitle(lesson.title)) issues.push(`عنوان درس في الوحدة ${unit.ordinal} غير واضح.`);
      if (!Number.isSafeInteger(lesson.pageStart) || lesson.pageStart < 1) issues.push(`صفحة درس في الوحدة ${unit.ordinal} غير صالحة.`);
    }
  }
  const pageSequence = units.flatMap((unit) => unit.lessons.map((lesson) => lesson.pageStart));
  for (let index = 1; index < pageSequence.length; index += 1) {
    if ((pageSequence[index] ?? 0) < (pageSequence[index - 1] ?? 0)) {
      issues.push("أرقام صفحات الدروس ليست متصاعدة وفق ترتيب الفهرس.");
      break;
    }
  }
  return [...new Set(issues)];
}

function buildNodes(sourceId: string, units: ParsedUnit[], totalPages: number): SourceStructureNode[] {
  const now = new Date().toISOString();
  const nodes: SourceStructureNode[] = [];
  for (const unit of units) {
    const unitId = `structure-pos-u${unit.ordinal}`;
    const firstPage = unit.lessons[0]?.pageStart ?? 1;
    nodes.push({
      id: unitId,
      sourceId,
      parentId: null,
      nodeType: "وحدة",
      title: cleanUnitTitle(unit.title),
      pageStart: firstPage,
      pageEnd: firstPage,
      orderIndex: nodes.length,
      confidence: unit.confidence,
      reviewStatus: "مرشح",
      extractionMethod: EXTRACTION_METHOD,
      createdAt: now,
      updatedAt: now,
    });
    for (const lesson of unit.lessons) {
      nodes.push({
        id: `structure-pos-u${unit.ordinal}-l${lesson.lessonOrdinal}`,
        sourceId,
        parentId: unitId,
        nodeType: "درس",
        title: `${lesson.lessonOrdinal}-${unit.ordinal} ${cleanText(lesson.title)}`,
        pageStart: lesson.pageStart,
        pageEnd: lesson.pageStart,
        orderIndex: nodes.length,
        confidence: lesson.confidence,
        reviewStatus: "مرشح",
        extractionMethod: EXTRACTION_METHOD,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  const roots = nodes.filter((node) => node.parentId === null);
  roots.forEach((root, index) => {
    const nextRoot = roots[index + 1];
    root.pageEnd = Math.max(root.pageStart, (nextRoot?.pageStart ?? (totalPages + 1)) - 1);
    const children = nodes.filter((node) => node.parentId === root.id);
    children.forEach((child, childIndex) => {
      const nextChild = children[childIndex + 1];
      child.pageEnd = Math.max(child.pageStart, (nextChild?.pageStart ?? (root.pageEnd + 1)) - 1);
    });
  });
  return resequenceStructureNodes(nodes);
}

export function extractStructureFromPositionalToc(
  sourceId: string,
  pages: SourceOcrLayoutPage[],
  totalPages: number,
): SourceStructureExtractionResult {
  const groups = pages.flatMap((page) => {
    const columns = layoutPageToColumns(page);
    return [parseColumn(columns.right), parseColumn(columns.left)];
  });
  const units = mergeUnits(groups);
  const issues = validateParsedUnits(units);
  const tocPages = pages.map((page) => page.pageNumber).sort((a, b) => a - b);
  if (issues.length) {
    return {
      sourceId,
      nodes: [],
      tocPages,
      usedFallback: false,
      reliableTocFound: false,
      manualTocRequired: true,
      candidateTocPages: tocPages,
      message: `رفض واثق الهيكل البصري لأنه لم يجتز التحقق: ${issues.slice(0, 3).join(" ")}`,
    };
  }
  const nodes = buildNodes(sourceId, units, totalPages);
  return {
    sourceId,
    nodes,
    tocPages,
    usedFallback: false,
    reliableTocFound: true,
    manualTocRequired: false,
    candidateTocPages: tocPages,
    message: `استخرج واثق بصريًا ${units.length} وحدة و${units.reduce((sum, unit) => sum + unit.lessons.length, 0)} درسًا من صفحات الفهرس ${tocPages.join("، ")}.`,
  };
}

export function detectTocPagesFromChunks(chunks: SourceTextChunk[], totalPages: number): number[] {
  const pages = chunksToPageTexts(chunks);
  const candidates = pages
    .filter((page) => page.pageNumber <= Math.min(totalPages, 30))
    .map((page) => {
      const normalized = normalizeArabic(page.content);
      const unitMentions = (normalized.match(/الوحده\s+(?:الاولي|الثانيه|الثالثه|الرابعه|الخامسه|السادسه|السابعه|الثامنه|التاسعه|العاشره|الحاديه عشره)/g) ?? []).length;
      const lessonCodes = (normalizeDigits(page.content).match(/\d{1,2}\s*[-–—‑]\s*\d{1,2}/g) ?? []).length;
      const header = /(?:المحتويات|الفهرس)/.test(normalized);
      return { pageNumber: page.pageNumber, score: (header ? 20 : 0) + unitMentions * 4 + lessonCodes };
    })
    .filter((candidate) => candidate.score >= 12)
    .sort((left, right) => right.score - left.score || left.pageNumber - right.pageNumber)
    .slice(0, 2)
    .map((candidate) => candidate.pageNumber)
    .sort((left, right) => left - right);
  return candidates;
}
