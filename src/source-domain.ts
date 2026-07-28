import { SUBJECTS } from "./data.js";
import type {
  ManagedSource,
  SourceAuthority,
  SourceDraft,
  SourceKind,
  SourceMode,
  SourceSemester,
  SourceValidation,
} from "./types.js";

export const SOURCE_SEMESTERS: Exclude<SourceSemester, "غير محدد">[] = ["الفصل الأول", "الفصل الثاني", "العام الكامل"];

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
  return "منهج عُماني";
}

function normalizeFingerprintPart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildSourceFingerprint(
  source: Pick<SourceDraft, "mode" | "kind" | "grade" | "subjectId" | "version" | "semester" | "fileName" | "url">,
): string {
  const reference = source.mode === "file" ? source.fileName : source.url;
  return [
    source.mode,
    source.kind,
    String(source.grade ?? ""),
    source.subjectId,
    source.semester,
    normalizeFingerprintPart(source.version),
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
    version: source.version,
    semester: source.semester,
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
  const authorityCode = authority === "منهج عُماني" ? "OM" : authority === "كامبريدج" ? "CA" : "GL";
  const subjectCode = SUBJECT_CODES[draft.subjectId] ?? "GEN";
  const kindCode = KIND_CODES[draft.kind];
  const semesterCode = draft.semester === "الفصل الأول" ? "S1" : draft.semester === "الفصل الثاني" ? "S2" : draft.semester === "العام الكامل" ? "FY" : "NA";
  const versionCode = draft.version.replace(/[^0-9A-Za-z]+/g, "").slice(0, 8).toUpperCase() || "V1";
  const sequence = now.getTime().toString(36).slice(-6).toUpperCase();
  return `WTH-${authorityCode}-G${String(draft.grade ?? 0).padStart(2, "0")}-${subjectCode}-${kindCode}-${semesterCode}-${versionCode}-${sequence}`;
}

export function createEmptySourceDraft(mode: SourceMode = "file"): SourceDraft {
  return {
    mode,
    title: "",
    kind: mode === "url" ? "مصدر عالمي" : "كتاب الطالب",
    grade: null,
    subjectId: "",
    version: "الإصدار الأول",
    semester: "",
    fileName: "",
    url: "",
    rightsConfirmed: false,
  };
}

export function folderForKind(kind: SourceKind): string {
  if (kind === "كتاب الطالب") return "كتاب_الطالب";
  if (kind === "دليل المعلم") return "دليل_المعلم";
  if (kind === "نواتج التعلم") return "نواتج_التعلم";
  if (kind === "جدول المواصفات") return "جداول_المواصفات";
  if (kind === "اختبار كامبريدج") return "أوراق_الأسئلة";
  return "مصادر_مساندة";
}


export function semesterDriveSegment(semester: SourceSemester | ""): string {
  if (semester === "الفصل الأول") return "الفصل_الأول";
  if (semester === "الفصل الثاني") return "الفصل_الثاني";
  if (semester === "العام الكامل") return "العام_الكامل";
  return "فصل_غير_محدد";
}

export function safeDriveSegment(value: string): string {
  return value.trim().replace(/[\/:*?"<>|]+/g, "-").replace(/\s+/g, "_") || "غير_محدد";
}

export function sourceSubjectLabel(subjectId: string): string {
  return SUBJECTS.find((item) => item.id === subjectId)?.label ?? "مادة_غير_محددة";
}

export function buildSourceDrivePath(draft: Pick<SourceDraft, "grade" | "subjectId" | "kind" | "semester">): string {
  const subjectSegment = safeDriveSegment(sourceSubjectLabel(draft.subjectId));
  const gradeSegment = draft.grade ? `الصف_${String(draft.grade).padStart(2, "0")}` : "صف_غير_محدد";
  const semesterSegment = semesterDriveSegment(draft.semester);

  if (draft.kind === "اختبار كامبريدج") {
    return `واثق/01_مصادر_المنصة/02_اختبارات_كامبريدج/${subjectSegment}/${gradeSegment}/${semesterSegment}/${folderForKind(draft.kind)}/`;
  }
  if (draft.kind === "مصدر عالمي") {
    return `واثق/01_مصادر_المنصة/03_مصادر_عالمية/${subjectSegment}/${gradeSegment}/${semesterSegment}/مصادر_مساندة/`;
  }
  return `واثق/01_مصادر_المنصة/01_المنهج_العماني/${gradeSegment}/${subjectSegment}/${semesterSegment}/${folderForKind(draft.kind)}/`;
}

export function validateSourceDraft(draft: SourceDraft): SourceValidation {
  const issues: SourceValidation["issues"] = [];
  if (!draft.title.trim()) issues.push({ field: "title", message: "اكتب اسمًا واضحًا للمصدر." });
  if (!draft.grade) issues.push({ field: "grade", message: "اختر الصف المرتبط بالمصدر." });
  if (!draft.subjectId) issues.push({ field: "subjectId", message: "اختر المادة المرتبطة بالمصدر." });
  if (!draft.version.trim()) issues.push({ field: "version", message: "اكتب رقم الإصدار أو سنته." });
  if (!draft.semester) issues.push({ field: "semester", message: "اختر الفصل الدراسي المرتبط بالمصدر." });

  if (draft.mode === "file") {
    if (!draft.fileName.trim()) {
      issues.push({ field: "fileName", message: "اختر ملف PDF قبل الإضافة." });
    } else if (!draft.fileName.toLowerCase().endsWith(".pdf")) {
      issues.push({ field: "fileName", message: "النسخة الأولى تقبل ملفات PDF فقط." });
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
    version: draft.version.trim(),
    semester: draft.semester || "غير محدد",
    ...(draft.mode === "file" ? { fileName: draft.fileName, uploadState: "غير مرفوع" as const } : { url: draft.url.trim() }),
    rightsConfirmed: draft.mode === "file" ? true : draft.rightsConfirmed,
    status: "جاهز للفهرسة",
    drivePath: buildSourceDrivePath(draft),
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
