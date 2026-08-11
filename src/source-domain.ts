import { SUBJECTS } from "./data.js";
import type {
  ManagedSource,
  SourceAuthority,
  SourceDraft,
  SourceKind,
  SourceMode,
  SourceValidation,
} from "./types.js";

export const SOURCE_KINDS: SourceKind[] = [
  "كتاب الطالب",
  "دليل المعلم",
  "نواتج التعلم",
  "جدول المواصفات",
  "اختبار كامبريدج",
  "مصدر عالمي",
];

const SUBJECT_CODES: Record<string, string> = {
  science: "SCI",
  physics: "PHY",
  chemistry: "CHM",
  biology: "BIO",
  combined_science: "CMB",
  coordinated_sciences: "CRD",
};

const KIND_CODES: Record<SourceKind, string> = {
  "كتاب الطالب": "STU",
  "دليل المعلم": "TCH",
  "نواتج التعلم": "OUT",
  "جدول المواصفات": "SPC",
  "اختبار كامبريدج": "CAM",
  "مصدر عالمي": "WEB",
};

export function authorityForKind(kind: SourceKind): SourceAuthority {
  if (kind === "اختبار كامبريدج") return "كامبريدج";
  if (kind === "مصدر عالمي") return "مصدر عالمي";
  return "مصدر مرفوع";
}

function normalizeFingerprintPart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildSourceFingerprint(
  source: Pick<SourceDraft, "mode" | "kind" | "grade" | "subjectId" | "fileName" | "url">,
): string {
  const reference = source.mode === "file" ? source.fileName : source.url;
  return [
    source.mode,
    source.kind,
    String(source.grade ?? ""),
    source.subjectId,
    normalizeFingerprintPart(reference),
  ].join("|");
}

export function findDuplicateSource(sources: ManagedSource[], draft: SourceDraft): ManagedSource | undefined {
  const fingerprint = buildSourceFingerprint(draft);
  return sources.find((source) => source.fingerprint === fingerprint || buildSourceFingerprint({
    mode: source.mode,
    kind: source.kind,
    grade: source.grade,
    subjectId: source.subjectId,
    fileName: source.fileName ?? "",
    url: source.url ?? "",
  }) === fingerprint);
}

export function findDuplicateContentSource(
  sources: ManagedSource[],
  contentFingerprint: string,
): ManagedSource | undefined {
  return sources.find((source) => source.contentFingerprint === contentFingerprint);
}

function buildCatalogCode(draft: SourceDraft, now: Date): string {
  const authority = authorityForKind(draft.kind);
  const authorityCode = authority === "مصدر مرفوع" ? "UP" : authority === "كامبريدج" ? "CA" : "GL";
  const subjectCode = SUBJECT_CODES[draft.subjectId] ?? "GEN";
  const kindCode = KIND_CODES[draft.kind];
  const stageCode = draft.grade === 10 ? "IG" : `S${String(draft.grade ?? 0).padStart(2, "0")}`;
  const sequence = now.getTime().toString(36).slice(-6).toUpperCase();
  return `WTH-${authorityCode}-${stageCode}-${subjectCode}-${kindCode}-${sequence}`;
}

export function createEmptySourceDraft(mode: SourceMode = "file"): SourceDraft {
  return {
    mode,
    title: "",
    kind: mode === "url" ? "مصدر عالمي" : "كتاب الطالب",
    grade: null,
    subjectId: "",
    fileName: "",
    url: "",
    rightsConfirmed: false,
  };
}

function catalogSegment(value: string): string {
  return value.trim().replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "") || "غير-محدد";
}

/**
 * مسار منطقي داخل فهرس واثق فقط. رفع المصادر اختياري ولا يعتمد على أي مخزن خارجي.
 */
export function buildSourceCatalogPath(draft: Pick<SourceDraft, "grade" | "subjectId" | "kind">): string {
  const subject = SUBJECTS.find((item) => item.id === draft.subjectId)?.label ?? (draft.subjectId || "science");
  const stage = draft.grade === 10 ? "igcse" : draft.grade ? `stage-${draft.grade}` : "stage-unspecified";
  return `wathiq://${catalogSegment(subject)}/${catalogSegment(stage)}/${catalogSegment(draft.kind)}`;
}

export function validateSourceDraft(draft: SourceDraft): SourceValidation {
  const issues: SourceValidation["issues"] = [];
  if (!draft.title.trim()) issues.push({ field: "title", message: "اكتب اسمًا واضحًا للمصدر." });
  if (!draft.grade) issues.push({ field: "grade", message: "اختر مرحلة Cambridge المرتبطة بالمصدر." });
  if (!draft.subjectId) issues.push({ field: "subjectId", message: "اختر مادة العلوم المرتبطة بالمصدر." });

  if (draft.mode === "file") {
    if (!draft.fileName.trim()) {
      issues.push({ field: "fileName", message: "اختر ملف PDF قبل الإضافة." });
    } else if (!draft.fileName.toLowerCase().endsWith(".pdf")) {
      issues.push({ field: "fileName", message: "رفع المصادر الاختيارية يقبل PDF حاليًا." });
    }
  }
  if (draft.mode === "url") {
    try {
      const parsed = new URL(draft.url);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("invalid");
    } catch {
      issues.push({ field: "url", message: "أدخل رابطًا صحيحًا يبدأ بـ http أو https." });
    }
    if (!draft.rightsConfirmed) {
      issues.push({ field: "rightsConfirmed", message: "أكد مراجعة حقوق الاستخدام قبل إضافة الرابط." });
    }
  }
  return { valid: issues.length === 0, issues };
}

export function createManagedSource(draft: SourceDraft, now = new Date()): ManagedSource {
  const validation = validateSourceDraft(draft);
  if (!validation.valid || !draft.grade) throw new Error("بيانات المصدر غير مكتملة.");
  const timestamp = now.toISOString();
  return {
    id: `source-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    catalogCode: buildCatalogCode(draft, now),
    fingerprint: buildSourceFingerprint(draft),
    authority: authorityForKind(draft.kind),
    title: draft.title.trim(),
    kind: draft.kind,
    mode: draft.mode,
    grade: draft.grade,
    subjectId: draft.subjectId,
    ...(draft.mode === "file" ? { fileName: draft.fileName } : { url: draft.url.trim() }),
    rightsConfirmed: draft.mode === "file" ? true : draft.rightsConfirmed,
    status: "جاهز للفهرسة",
    catalogPath: buildSourceCatalogPath(draft),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function changeSourceStatus(
  sources: ManagedSource[],
  sourceId: string,
  status: ManagedSource["status"],
  now = new Date(),
): ManagedSource[] {
  return sources.map((source) =>
    source.id === sourceId ? { ...source, status, updatedAt: now.toISOString() } : source,
  );
}
