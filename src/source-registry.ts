import type { ManagedSource, SourceImportResult, SourceMergeResult, SourceRegistryBackup } from "./types.js";
import { authorityForKind, buildSourceFingerprint } from "./source-domain.js";

const VALID_STATUSES = new Set(["جاهز للفهرسة", "مفهرس", "يحتاج مراجعة", "مؤرشف"]);
const VALID_KINDS = new Set(["كتاب الطالب", "دليل المعلم", "نواتج التعلم", "جدول المواصفات", "اختبار كامبريدج", "مصدر عالمي"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeManagedSource(value: unknown): ManagedSource | null {
  if (!isRecord(value)) return null;
  const requiredStrings = ["id", "title", "kind", "mode", "subjectId", "version", "status", "drivePath", "createdAt", "updatedAt"];
  if (requiredStrings.some((key) => typeof value[key] !== "string" || !(value[key] as string).trim())) return null;
  if (typeof value.grade !== "number" || value.grade < 1 || value.grade > 12) return null;
  if (!VALID_KINDS.has(value.kind as string) || !VALID_STATUSES.has(value.status as string)) return null;
  if (value.mode !== "file" && value.mode !== "url") return null;
  if (value.mode === "file" && typeof value.fileName !== "string") return null;
  if (value.mode === "url" && typeof value.url !== "string") return null;

  const partial = value as unknown as ManagedSource;
  const fingerprint = typeof value.fingerprint === "string" && value.fingerprint
    ? value.fingerprint
    : buildSourceFingerprint({
        mode: partial.mode,
        kind: partial.kind,
        grade: partial.grade,
        subjectId: partial.subjectId,
        version: partial.version,
        fileName: partial.fileName ?? "",
        url: partial.url ?? "",
      });
  const catalogCode = typeof value.catalogCode === "string" && value.catalogCode
    ? value.catalogCode
    : `WTH-LEGACY-${partial.id.slice(-8).toUpperCase()}`;

  const optionalStrings = [
    "contentFingerprint",
    "mimeType",
    "driveFileId",
    "driveParentFolderId",
    "driveOriginalParentFolderId",
    "driveWebViewLink",
    "driveMd5Checksum",
    "uploadState",
    "uploadedAt",
    "extractionStatus",
    "extractionMessage",
    "extractedLanguage",
    "extractionPreview",
    "extractedAt",
    "extractionVersion",
  ] as const;
  const optionalValues: Record<string, string | number> = {};
  optionalStrings.forEach((key) => {
    if (typeof value[key] === "string" && value[key]) optionalValues[key] = value[key] as string;
  });
  if (typeof value.fileSizeBytes === "number" && Number.isFinite(value.fileSizeBytes) && value.fileSizeBytes >= 0) {
    optionalValues.fileSizeBytes = value.fileSizeBytes;
  }
  if (typeof value.extractedPageCount === "number" && Number.isFinite(value.extractedPageCount) && value.extractedPageCount >= 0) {
    optionalValues.extractedPageCount = value.extractedPageCount;
  }
  if (typeof value.extractedCharacterCount === "number" && Number.isFinite(value.extractedCharacterCount) && value.extractedCharacterCount >= 0) {
    optionalValues.extractedCharacterCount = value.extractedCharacterCount;
  }

  return {
    ...partial,
    ...optionalValues,
    catalogCode,
    fingerprint,
    authority: authorityForKind(partial.kind),
    rightsConfirmed: Boolean(value.rightsConfirmed),
    ...(Array.isArray(value.detectedHeadings) && value.detectedHeadings.some((item) => typeof item === "string")
      ? { detectedHeadings: value.detectedHeadings.filter((item): item is string => typeof item === "string") }
      : {}),
  };
}

export function createRegistryBackup(sources: ManagedSource[], exportedAt = new Date()): SourceRegistryBackup {
  return {
    schemaVersion: 1,
    product: "واثق",
    exportedAt: exportedAt.toISOString(),
    sources,
  };
}

export function parseRegistryBackup(raw: string): SourceImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { valid: false, sources: [], issues: ["الملف ليس JSON صالحًا."] };
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || parsed.product !== "واثق" || !Array.isArray(parsed.sources)) {
    return { valid: false, sources: [], issues: ["الملف ليس نسخة احتياطية معتمدة من سجل مصادر واثق."] };
  }
  const normalized = parsed.sources.map(normalizeManagedSource);
  const invalidCount = normalized.filter((source) => source === null).length;
  if (invalidCount > 0) {
    return { valid: false, sources: [], issues: [`يوجد ${invalidCount} سجل مصدر غير صالح داخل الملف.`] };
  }
  return { valid: true, sources: normalized as ManagedSource[], issues: [] };
}

export function mergeSourceRegistry(existing: ManagedSource[], incoming: ManagedSource[]): SourceMergeResult {
  const fingerprints = new Set(existing.map((source) => source.fingerprint));
  const ids = new Set(existing.map((source) => source.id));
  const added: ManagedSource[] = [];
  let skippedCount = 0;

  incoming.forEach((source) => {
    if (fingerprints.has(source.fingerprint) || ids.has(source.id)) {
      skippedCount += 1;
      return;
    }
    fingerprints.add(source.fingerprint);
    ids.add(source.id);
    added.push(source);
  });

  return { sources: [...added, ...existing], addedCount: added.length, skippedCount };
}
