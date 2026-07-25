import { SUBJECTS } from "./data.js";
import type {
  ManagedSource,
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

export function createEmptySourceDraft(mode: SourceMode = "file"): SourceDraft {
  return {
    mode,
    title: "",
    kind: mode === "url" ? "مصدر عالمي" : "كتاب الطالب",
    grade: null,
    subjectId: "",
    version: "الإصدار الأول",
    fileName: "",
    url: "",
    rightsConfirmed: false,
  };
}

function folderForKind(kind: SourceKind): string {
  if (kind === "كتاب الطالب") return "كتاب_الطالب";
  if (kind === "دليل المعلم") return "دليل_المعلم";
  if (kind === "نواتج التعلم") return "نواتج_التعلم";
  if (kind === "جدول المواصفات") return "جداول_المواصفات";
  if (kind === "اختبار كامبريدج") return "أوراق_الأسئلة";
  return "مصادر_مساندة";
}

function safeSegment(value: string): string {
  return value.trim().replace(/[\/:*?"<>|]+/g, "-").replace(/\s+/g, "_") || "غير_محدد";
}

export function buildSourceDrivePath(draft: Pick<SourceDraft, "grade" | "subjectId" | "kind">): string {
  const subject = SUBJECTS.find((item) => item.id === draft.subjectId)?.label ?? "مادة_غير_محددة";
  const subjectSegment = safeSegment(subject);
  const gradeSegment = draft.grade ? `الصف_${String(draft.grade).padStart(2, "0")}` : "صف_غير_محدد";

  if (draft.kind === "اختبار كامبريدج") {
    return `واثق/01_مصادر_المنصة/اختبارات_كامبريدج/${subjectSegment}/غير_مصنف/${folderForKind(draft.kind)}/`;
  }
  if (draft.kind === "مصدر عالمي") {
    return `واثق/01_مصادر_المنصة/مصادر_عالمية_إضافية/${subjectSegment}/${gradeSegment}/`;
  }
  return `واثق/01_مصادر_المنصة/المنهج_العماني/${gradeSegment}/${subjectSegment}/${folderForKind(draft.kind)}/`;
}

export function validateSourceDraft(draft: SourceDraft): SourceValidation {
  const issues: SourceValidation["issues"] = [];
  if (!draft.title.trim()) issues.push({ field: "title", message: "اكتب اسمًا واضحًا للمصدر." });
  if (!draft.grade) issues.push({ field: "grade", message: "اختر الصف المرتبط بالمصدر." });
  if (!draft.subjectId) issues.push({ field: "subjectId", message: "اختر المادة المرتبطة بالمصدر." });
  if (!draft.version.trim()) issues.push({ field: "version", message: "اكتب رقم الإصدار أو سنته." });

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
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid');
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
    title: draft.title.trim(),
    kind: draft.kind,
    mode: draft.mode,
    grade: draft.grade,
    subjectId: draft.subjectId,
    version: draft.version.trim(),
    ...(draft.mode === "file" ? { fileName: draft.fileName } : { url: draft.url.trim() }),
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
