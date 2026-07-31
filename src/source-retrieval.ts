import type { ExamSourceReference, ManagedSource, SourceTextChunk } from "./types.js";

const ARABIC_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const NON_WORDS = /[^\p{L}\p{N}]+/gu;
const STOP_WORDS = new Set([
  "في", "من", "الى", "إلى", "على", "عن", "ما", "ماذا", "كيف", "هل", "هو", "هي", "هذا", "هذه",
  "ذلك", "تلك", "ثم", "او", "أو", "و", "ف", "ب", "ك", "ل", "التي", "الذي", "الذين", "مع", "بين",
  "درس", "موضوع", "وحدة", "اختبار", "شرح", "تعريف", "كل", "مكان", "داخل", "خارج",
]);

export const SOURCE_RETRIEVAL_VERSION = "strict-lesson-scope-3-pdf-pages";

export interface SourceChunkCandidate {
  source: ManagedSource;
  chunk: SourceTextChunk;
}

export interface RetrievalResult {
  references: ExamSourceReference[];
  matchedSourceCount: number;
  searchedChunkCount: number;
}

export function normalizeArabicSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(ARABIC_DIACRITICS, "")
    .replace(/ـ/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(NON_WORDS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function tokenizeArabicSearch(value: string): string[] {
  const tokens = normalizeArabicSearchText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
  return [...new Set(tokens)];
}

function sourcePriority(source: ManagedSource): number {
  const authority = source.authority === "منهج عُماني" ? 30 : source.authority === "كامبريدج" ? 20 : 10;
  const kind = ({
    "نواتج التعلم": 9,
    "جدول المواصفات": 8,
    "كتاب الطالب": 7,
    "دليل المعلم": 6,
    "اختبار كامبريدج": 4,
    "مصدر عالمي": 2,
  } as const)[source.kind] ?? 0;
  return authority + kind;
}

export function isLikelyNavigationOrMetadataChunk(content: string): boolean {
  const normalized = normalizeArabicSearchText(content);
  if (!normalized) return true;
  if (["المحتويات", "الفهرس", "حقوق الطبع", "حقوق النشر", "الطبعه التجريبيه", "الناشر"].some((marker) => normalized.includes(marker))) {
    return true;
  }
  const lessonCodes = content.match(/(?:^|\s)\d{1,2}\s*[-–—]\s*\d{1,2}(?=\s|$)/g) ?? [];
  const unitMentions = normalized.match(/الوحده/g) ?? [];
  const punctuation = content.match(/[.؟!؛:]/g) ?? [];
  if (lessonCodes.length >= 4 && punctuation.length <= 5) return true;
  if (unitMentions.length >= 4 && punctuation.length <= 4) return true;
  return false;
}

export function referenceSupportsLesson(query: string, content: string): boolean {
  if (isLikelyNavigationOrMetadataChunk(content)) return false;
  const tokens = tokenizeArabicSearch(query);
  if (!tokens.length) return false;
  const normalized = normalizeArabicSearchText(content);
  const matched = tokens.filter((token) => normalized.includes(token)).length;
  const required = tokens.length === 1 ? 1 : Math.min(2, tokens.length);
  return matched >= required;
}

function scoreChunk(query: string, tokens: string[], candidate: SourceChunkCandidate): number {
  const normalized = normalizeArabicSearchText(candidate.chunk.content);
  if (!normalized || !referenceSupportsLesson(query, candidate.chunk.content)) return 0;
  let score = 0;
  const normalizedQuery = normalizeArabicSearchText(query);
  const corePhrase = tokens.join(" ");
  if (normalizedQuery.length >= 4 && normalized.includes(normalizedQuery)) score += 60;
  else if (corePhrase.length >= 4 && normalized.includes(corePhrase)) score += 42;
  for (const token of tokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = normalized.match(new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`, "g"));
    if (matches?.length) score += 12 + Math.min(18, (matches.length - 1) * 4);
    else if (normalized.includes(token)) score += 5;
  }
  if (tokens.length && tokens.every((token) => normalized.includes(token))) score += 20;
  if (candidate.chunk.content.length >= 500) score += 8;
  if ((candidate.chunk.content.match(/[.؟!؛]/g) ?? []).length >= 3) score += 5;
  return score + sourcePriority(candidate.source) / 10;
}

function excerptAroundMatch(content: string, tokens: string[], maxLength = 300): string {
  const compact = content.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  const normalized = normalizeArabicSearchText(compact);
  let matchIndex = -1;
  for (const token of tokens) {
    const index = normalized.indexOf(token);
    if (index >= 0 && (matchIndex < 0 || index < matchIndex)) matchIndex = index;
  }
  if (matchIndex < 0) return `${compact.slice(0, maxLength).trim()}…`;
  const ratio = normalized.length ? matchIndex / normalized.length : 0;
  const approximateOriginalIndex = Math.floor(compact.length * ratio);
  const start = Math.max(0, approximateOriginalIndex - Math.floor(maxLength * 0.35));
  const end = Math.min(compact.length, start + maxLength);
  return `${start > 0 ? "…" : ""}${compact.slice(start, end).trim()}${end < compact.length ? "…" : ""}`;
}

export function rankSourceChunks(query: string, candidates: SourceChunkCandidate[], limit = 6): RetrievalResult {
  const tokens = tokenizeArabicSearch(query);
  if (!tokens.length) return { references: [], matchedSourceCount: 0, searchedChunkCount: candidates.length };

  const scored = candidates
    .map((candidate) => ({ candidate, score: scoreChunk(query, tokens, candidate) }))
    .filter((entry) => entry.score >= 8)
    .sort((a, b) => b.score - a.score || a.candidate.chunk.pageFrom - b.candidate.chunk.pageFrom);

  const perSource = new Map<string, number>();
  const references: ExamSourceReference[] = [];
  for (const entry of scored) {
    const count = perSource.get(entry.candidate.source.id) ?? 0;
    if (count >= 3) continue;
    perSource.set(entry.candidate.source.id, count + 1);
    references.push({
      id: `${entry.candidate.source.id}:${entry.candidate.chunk.chunkIndex}`,
      sourceId: entry.candidate.source.id,
      sourceTitle: entry.candidate.source.title,
      sourceKind: entry.candidate.source.kind,
      pageFrom: entry.candidate.chunk.pageFrom,
      pageTo: entry.candidate.chunk.pageTo,
      excerpt: excerptAroundMatch(entry.candidate.chunk.content, tokens),
      context: entry.candidate.chunk.content,
      score: Math.round(entry.score * 10) / 10,
    });
    if (references.length >= limit) break;
  }

  return {
    references,
    matchedSourceCount: new Set(references.map((reference) => reference.sourceId)).size,
    searchedChunkCount: candidates.length,
  };
}
