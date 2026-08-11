import type { AssessmentType, CognitiveLevel, ExamTitleOption, ItemDifficulty, QuestionCounts, QuestionType } from "./types.js";

/** جدول مواصفات العلوم المعتمد في واثق للصفوف 5-10، مع قالب داخلي مبسط للصفوف 1-4. */
export const SCIENCE_ASSESSMENT_POLICY_ID = "oman-science-assessment-2025-2026-v1";
export const CAMBRIDGE_ASSESSMENT_POLICY_ID = SCIENCE_ASSESSMENT_POLICY_ID;

export const EXAM_TITLE_OPTIONS = [
  "الاختبار القصير الأول",
  "الاختبار القصير الثاني",
  "الاختبار النهائي",
] as const satisfies readonly ExamTitleOption[];

export interface MarkDistribution {
  knowledge: number;
  application: number;
  reasoning: number;
}

export interface DifficultyDistribution {
  low: number;
  medium: number;
  high: number;
}

export interface ScienceAssessmentSpecification {
  title: ExamTitleOption;
  assessmentType: AssessmentType;
  sourceLabel: string;
  official: boolean;
  gradeFrom: number;
  gradeTo: number;
  durationMinutes: number;
  durationOfficial: boolean;
  totalMarks: number;
  itemCountMin: number;
  itemCountMax: number;
  operationalItemCount: number;
  counts: QuestionCounts;
  objectiveMarks: MarkDistribution;
  difficultyMarks?: DifficultyDistribution;
  scientificInquiryRange?: readonly [number, number];
  operationalInquiryMarks?: number;
  notes: readonly string[];
}

export interface AssessmentPlanEntry {
  type: QuestionType;
  marks: number;
}

const OFFICIAL_SOURCE = "وثيقة تقويم تعلم الطلبة في مواد العلوم للصفوف 5-10 · إصدار 2025/2026";
const INTERNAL_SOURCE = "قالب واثق المبسط للصفوف 1-4 · غير مصنف كمواصفة رسمية";

const EARLY_SHORT: ScienceAssessmentSpecification = {
  title: "الاختبار القصير الأول",
  assessmentType: "اختبار قصير",
  sourceLabel: INTERNAL_SOURCE,
  official: false,
  gradeFrom: 1,
  gradeTo: 4,
  durationMinutes: 20,
  durationOfficial: false,
  totalMarks: 10,
  itemCountMin: 6,
  itemCountMax: 6,
  operationalItemCount: 6,
  counts: { mcq: 2, short: 4, long: 0 },
  objectiveMarks: { knowledge: 4, application: 4, reasoning: 2 },
  notes: ["قالب مرحلي مبسط؛ المواصفة الرسمية المرفوعة في واثق تبدأ من الصف الخامس."],
};

const EARLY_FINAL: ScienceAssessmentSpecification = {
  ...EARLY_SHORT,
  title: "الاختبار النهائي",
  assessmentType: "اختبار نهائي",
  durationMinutes: 45,
  durationOfficial: false,
  totalMarks: 20,
  itemCountMin: 12,
  itemCountMax: 12,
  operationalItemCount: 12,
  counts: { mcq: 4, short: 8, long: 0 },
  objectiveMarks: { knowledge: 8, application: 8, reasoning: 4 },
  difficultyMarks: { low: 8, medium: 8, high: 4 },
};

function officialShortSpec(grade: number, title: ExamTitleOption): ScienceAssessmentSpecification {
  if (grade === 10) {
    return {
      title,
      assessmentType: "اختبار قصير",
      sourceLabel: OFFICIAL_SOURCE,
      official: true,
      gradeFrom: 10,
      gradeTo: 10,
      durationMinutes: 20,
      durationOfficial: false,
      totalMarks: 10,
      itemCountMin: 5,
      itemCountMax: 7,
      operationalItemCount: 6,
      counts: { mcq: 2, short: 3, long: 1 },
      objectiveMarks: { knowledge: 4, application: 4, reasoning: 2 },
      notes: [
        "مفردتان اختيار من متعدد تغطيان المعرفة والتطبيق.",
        "مفردة واحدة إجابة طويلة، والبقية إجابات قصيرة.",
        "زمن 20 دقيقة إعداد تشغيلي داخل واثق؛ صفحة جدول المواصفات المرجعية لا تحدد زمن الاختبار القصير.",
      ],
    };
  }
  if (grade === 9) {
    return {
      title,
      assessmentType: "اختبار قصير",
      sourceLabel: OFFICIAL_SOURCE,
      official: true,
      gradeFrom: 9,
      gradeTo: 9,
      durationMinutes: 25,
      durationOfficial: false,
      totalMarks: 15,
      itemCountMin: 8,
      itemCountMax: 12,
      operationalItemCount: 9,
      counts: { mcq: 3, short: 5, long: 1 },
      objectiveMarks: { knowledge: 6, application: 6, reasoning: 3 },
      notes: [
        "ثلاث مفردات اختيار من متعدد تغطي هدفَي تقويم على الأقل.",
        "مفردة واحدة إجابة طويلة، والبقية إجابات قصيرة.",
        "زمن 25 دقيقة إعداد تشغيلي داخل واثق؛ صفحة جدول المواصفات المرجعية لا تحدد زمن الاختبار القصير.",
      ],
    };
  }
  return {
    title,
    assessmentType: "اختبار قصير",
    sourceLabel: OFFICIAL_SOURCE,
    official: true,
    gradeFrom: 5,
    gradeTo: 8,
    durationMinutes: 25,
    durationOfficial: false,
    totalMarks: 15,
    itemCountMin: 8,
    itemCountMax: 12,
    operationalItemCount: 10,
    counts: { mcq: 3, short: 7, long: 0 },
    objectiveMarks: { knowledge: 6, application: 6, reasoning: 3 },
    notes: [
      "ثلاث مفردات اختيار من متعدد تغطي هدفَي تقويم على الأقل.",
      "بقية المفردات إجابات قصيرة ضمن المدى الرسمي 8-12 مفردة.",
      "زمن 25 دقيقة إعداد تشغيلي داخل واثق؛ صفحة جدول المواصفات المرجعية لا تحدد زمن الاختبار القصير.",
    ],
  };
}

function officialFinalSpec(grade: number): ScienceAssessmentSpecification {
  if (grade === 10) {
    return {
      title: "الاختبار النهائي",
      assessmentType: "اختبار نهائي",
      sourceLabel: OFFICIAL_SOURCE,
      official: true,
      gradeFrom: 10,
      gradeTo: 10,
      durationMinutes: 120,
      durationOfficial: true,
      totalMarks: 60,
      itemCountMin: 30,
      itemCountMax: 40,
      operationalItemCount: 34,
      counts: { mcq: 10, short: 22, long: 2 },
      objectiveMarks: { knowledge: 24, application: 24, reasoning: 12 },
      difficultyMarks: { low: 24, medium: 24, high: 12 },
      scientificInquiryRange: [8, 10],
      operationalInquiryMarks: 10,
      notes: [
        "عشر مفردات اختيار من متعدد بواقع درجة واحدة لكل مفردة.",
        "مفردتان على الأقل إجابة طويلة، والبقية إجابات قصيرة.",
        "يخصص واثق 10 درجات للاستقصاء العلمي ضمن النطاق الرسمي 8-10 درجات.",
      ],
    };
  }
  if (grade === 9) {
    return {
      title: "الاختبار النهائي",
      assessmentType: "اختبار نهائي",
      sourceLabel: OFFICIAL_SOURCE,
      official: true,
      gradeFrom: 9,
      gradeTo: 9,
      durationMinutes: 90,
      durationOfficial: true,
      totalMarks: 40,
      itemCountMin: 25,
      itemCountMax: 35,
      operationalItemCount: 25,
      counts: { mcq: 8, short: 15, long: 2 },
      objectiveMarks: { knowledge: 16, application: 16, reasoning: 8 },
      difficultyMarks: { low: 16, medium: 16, high: 8 },
      scientificInquiryRange: [6, 8],
      operationalInquiryMarks: 8,
      notes: [
        "ثمان مفردات اختيار من متعدد بواقع درجة واحدة لكل مفردة.",
        "مفردتان على الأقل إجابة طويلة، والبقية إجابات قصيرة.",
        "يخصص واثق 8 درجات للاستقصاء العلمي ضمن النطاق الرسمي 6-8 درجات.",
      ],
    };
  }
  return {
    title: "الاختبار النهائي",
    assessmentType: "اختبار نهائي",
    sourceLabel: OFFICIAL_SOURCE,
    official: true,
    gradeFrom: 5,
    gradeTo: 8,
    durationMinutes: 90,
    durationOfficial: true,
    totalMarks: 40,
    itemCountMin: 25,
    itemCountMax: 35,
    operationalItemCount: 25,
    counts: { mcq: 8, short: 17, long: 0 },
    objectiveMarks: { knowledge: 16, application: 16, reasoning: 8 },
    difficultyMarks: { low: 16, medium: 16, high: 8 },
    scientificInquiryRange: [6, 8],
    operationalInquiryMarks: 8,
    notes: [
      "ثمان مفردات اختيار من متعدد بواقع درجة واحدة لكل مفردة.",
      "بقية المفردات إجابات قصيرة.",
      "يخصص واثق 8 درجات للاستقصاء العلمي ضمن النطاق الرسمي 6-8 درجات.",
    ],
  };
}

export function assessmentSpecification(grade: number | null, title: ExamTitleOption): ScienceAssessmentSpecification {
  const resolvedGrade = grade ?? 10;
  if (resolvedGrade <= 4) {
    const base = title === "الاختبار النهائي" ? EARLY_FINAL : EARLY_SHORT;
    return { ...base, title, assessmentType: title === "الاختبار النهائي" ? "اختبار نهائي" : "اختبار قصير" };
  }
  if (title === "الاختبار النهائي") return officialFinalSpec(resolvedGrade);
  return officialShortSpec(resolvedGrade, title);
}

export function assessmentPreset(title: ExamTitleOption, grade: number | null = 5): ScienceAssessmentSpecification {
  return assessmentSpecification(grade, title);
}

export function assessmentTypeForTitle(title: ExamTitleOption): AssessmentType {
  return title === "الاختبار النهائي" ? "اختبار نهائي" : "اختبار قصير";
}

export function isExamTitleOption(value: string): value is ExamTitleOption {
  return (EXAM_TITLE_OPTIONS as readonly string[]).includes(value);
}

export function buildAssessmentEntries(spec: ScienceAssessmentSpecification): AssessmentPlanEntry[] {
  const entries: AssessmentPlanEntry[] = [];
  for (let i = 0; i < spec.counts.mcq; i += 1) entries.push({ type: "اختيار من متعدد", marks: 1 });

  const longMarks = Array.from({ length: spec.counts.long }, () => 4);
  const usedFixedMarks = spec.counts.mcq + longMarks.reduce((sum, marks) => sum + marks, 0);
  const shortMarksTotal = spec.totalMarks - usedFixedMarks;
  if (shortMarksTotal < spec.counts.short) throw new Error("جدول المواصفات لا يتيح درجة واحدة لكل إجابة قصيرة.");
  const shortMarks = Array.from({ length: spec.counts.short }, () => 1);
  let remaining = shortMarksTotal - shortMarks.length;
  for (let i = 0; i < shortMarks.length && remaining > 0; i = (i + 1) % shortMarks.length) {
    if (shortMarks[i]! >= 3) continue;
    shortMarks[i]! += 1;
    remaining -= 1;
  }
  for (const marks of shortMarks) entries.push({ type: "إجابة قصيرة", marks });
  for (const marks of longMarks) entries.push({ type: "إجابة طويلة", marks });

  if (entries.length !== spec.operationalItemCount || entries.reduce((sum, item) => sum + item.marks, 0) !== spec.totalMarks) {
    throw new Error("تعذر بناء توزيع المفردات وفق جدول المواصفات.");
  }
  return entries;
}

function assignByMarkTargets<T extends string>(
  entries: readonly AssessmentPlanEntry[],
  labels: readonly T[],
  targetMarks: Readonly<Record<T, number>>,
): T[] {
  const total = entries.reduce((sum, item) => sum + item.marks, 0);
  const targetTotal = labels.reduce((sum, label) => sum + targetMarks[label], 0);
  if (total !== targetTotal) throw new Error("مجموع أهداف التوزيع لا يساوي الدرجة الكلية.");

  const memo = new Set<string>();
  const assigned = Array<T>(entries.length);
  const remaining = new Map<T, number>(labels.map((label) => [label, targetMarks[label]]));
  const search = (index: number): boolean => {
    if (index >= entries.length) return labels.every((label) => remaining.get(label) === 0);
    const key = `${index}|${labels.map((label) => remaining.get(label)).join("|")}`;
    if (memo.has(key)) return false;
    const marks = entries[index]!.marks;
    const preferred = labels.map((_, offset) => labels[(index + offset) % labels.length]!);
    for (const label of preferred) {
      const left = remaining.get(label) ?? 0;
      if (left < marks) continue;
      remaining.set(label, left - marks);
      assigned[index] = label;
      if (search(index + 1)) return true;
      remaining.set(label, left);
    }
    memo.add(key);
    return false;
  };
  if (!search(0)) throw new Error("تعذر توزيع درجات جدول المواصفات على المفردات بدقة.");
  return assigned;
}

export function cognitiveLevelsForEntries(entries: readonly AssessmentPlanEntry[], spec: ScienceAssessmentSpecification): CognitiveLevel[] {
  return assignByMarkTargets(entries, ["معرفة", "تطبيق", "استدلال"] as const, {
    معرفة: spec.objectiveMarks.knowledge,
    تطبيق: spec.objectiveMarks.application,
    استدلال: spec.objectiveMarks.reasoning,
  });
}

export function difficultyLevelsForEntries(entries: readonly AssessmentPlanEntry[], spec: ScienceAssessmentSpecification): Array<ItemDifficulty | undefined> {
  if (!spec.difficultyMarks) return entries.map(() => undefined);
  return assignByMarkTargets(entries, ["منخفض", "متوسط", "مرتفع"] as const, {
    منخفض: spec.difficultyMarks.low,
    متوسط: spec.difficultyMarks.medium,
    مرتفع: spec.difficultyMarks.high,
  });
}

export function inquiryFlagsForEntries(entries: readonly AssessmentPlanEntry[], spec: ScienceAssessmentSpecification): boolean[] {
  const target = spec.operationalInquiryMarks ?? 0;
  const flags = entries.map(() => false);
  if (!target) return flags;
  let remaining = target;
  const candidateIndexes = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.type !== "اختيار من متعدد")
    .sort((a, b) => b.entry.marks - a.entry.marks || a.index - b.index);
  for (const { entry, index } of candidateIndexes) {
    if (remaining <= 0) break;
    if (entry.marks <= remaining) {
      flags[index] = true;
      remaining -= entry.marks;
    }
  }
  if (remaining !== 0) throw new Error("تعذر تخصيص درجات الاستقصاء العلمي وفق جدول المواصفات.");
  return flags;
}
