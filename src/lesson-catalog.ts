import type { ManagedSource } from "./types.js";

export interface LessonCatalogOption {
  id: string;
  sourceId: string;
  sourceTitle: string;
  label: string;
  code: string;
  title: string;
  origin: "detected-heading";
}

function normalizeArabicDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

function normalizeText(value: string): string {
  return normalizeArabicDigits(value)
    .replace(/[–—‑−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value: string): string {
  return normalizeText(value)
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/ـ/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("ar");
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function parseLessonHeading(value: string): { code: string; title: string; label: string } | null {
  const normalized = normalizeText(value).replace(/^(?:الدرس|درس)\s+/iu, "");
  const numbered = normalized.match(/^([0-9]{1,2}\s*[-.]\s*[0-9]{1,2})\s*[:：\-]?\s*(.+)$/u);
  if (!numbered) return null;
  const code = numbered[1]!.replace(/\s+/g, "").replace(".", "-");
  const title = numbered[2]!
    .replace(/^[\s:：\-–—]+/u, "")
    .replace(/\s+(?:ص(?:فحة)?\s*)?[0-9]{1,3}\s*$/iu, "")
    .trim();
  if (title.length < 3 || title.length > 140) return null;
  if (/^(?:الوحدة|الفصل|المحتويات|الفهرس)\b/iu.test(title)) return null;
  return { code, title, label: `${code} ${title}` };
}

/**
 * Suggestions only. The user is always free to type lesson names manually.
 * Wathiq does not depend on a hard-coded textbook tree or a fragile TOC parser.
 */
export function buildLessonCatalog(sources: readonly ManagedSource[]): LessonCatalogOption[] {
  const unique = new Map<string, LessonCatalogOption>();
  for (const source of sources) {
    for (const heading of source.detectedHeadings ?? []) {
      const parsed = parseLessonHeading(heading);
      if (!parsed) continue;
      const key = normalizeKey(`${source.id}|${parsed.label}`);
      if (unique.has(key)) continue;
      unique.set(key, {
        id: `lesson-${source.id}-${stableHash(parsed.label)}`,
        sourceId: source.id,
        sourceTitle: source.title,
        label: parsed.label,
        code: parsed.code,
        title: parsed.title,
        origin: "detected-heading",
      });
    }
  }
  return [...unique.values()].sort((left, right) => {
    const [la, lb] = left.code.split("-").map(Number);
    const [ra, rb] = right.code.split("-").map(Number);
    return (la ?? 999) - (ra ?? 999) || (lb ?? 999) - (rb ?? 999) || left.title.localeCompare(right.title, "ar");
  });
}
