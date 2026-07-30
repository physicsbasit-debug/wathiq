import type { CognitiveLevel, ExamTitleOption, ItemDifficulty, QuestionCounts, QuestionType } from "./types.js";

export const SCIENCE_ASSESSMENT_POLICY_ID = "oman-science-assessment-2025-2026";
export const SCIENCE_ASSESSMENT_POLICY_TITLE = "وثيقة تقويم تعلّم الطلبة في مواد العلوم للصفوف (5-10)";
export const SCIENCE_ASSESSMENT_POLICY_VERSION = "2025/2026";
export const SCIENCE_ASSESSMENT_POLICY_PUBLISHED = "سبتمبر 2025";
export const SCIENCE_ASSESSMENT_POLICY_DOCUMENT_PATH = "./references/science-assessment-policy-2025-2026.pdf";

export const EXAM_TITLE_OPTIONS = [
  "الاختبار القصير الأول",
  "الاختبار القصير الثاني",
  "الاختبار النهائي",
] as const satisfies readonly ExamTitleOption[];

export type OfficialScienceGrade = 5 | 6 | 7 | 8 | 9 | 10;
export type OfficialAssessmentType = "اختبار قصير رسمي" | "امتحان نهاية الفصل الدراسي";

export interface AssessmentBlueprintItem {
  questionType: QuestionType;
  cognitiveLevel: CognitiveLevel;
  marks: 1 | 2 | 3 | 4;
  difficultyLevel?: ItemDifficulty;
}

export interface OfficialAssessmentSpec {
  assessmentType: OfficialAssessmentType;
  gradeFrom: OfficialScienceGrade;
  gradeTo: OfficialScienceGrade;
  totalMarks: 10 | 15 | 40 | 60;
  durationLabel: "حصة دراسية واحدة" | "ساعة ونصف" | "ساعتان";
  defaultDurationMinutes: 40 | 90 | 120;
  minItems: number;
  maxItems: number;
  cognitiveMarks: Readonly<Record<CognitiveLevel, number>>;
  difficultyMarks?: Readonly<Record<ItemDifficulty, number>>;
  counts: Readonly<QuestionCounts>;
  blueprint: readonly AssessmentBlueprintItem[];
  notes: readonly string[];
}

export type OfficialShortTestSpec = OfficialAssessmentSpec & {
  assessmentType: "اختبار قصير رسمي";
  totalMarks: 10 | 15;
  durationLabel: "حصة دراسية واحدة";
  defaultDurationMinutes: 40;
};

export type OfficialFinalExamSpec = OfficialAssessmentSpec & {
  assessmentType: "امتحان نهاية الفصل الدراسي";
  totalMarks: 40 | 60;
  durationLabel: "ساعة ونصف" | "ساعتان";
  defaultDurationMinutes: 90 | 120;
  difficultyMarks: Readonly<Record<ItemDifficulty, number>>;
};

interface BlueprintGroup {
  questionType: QuestionType;
  cognitiveLevel: CognitiveLevel;
  difficultyLevel?: ItemDifficulty;
  marks: 1 | 2 | 3 | 4;
  count: number;
}

function expandBlueprint(groups: readonly BlueprintGroup[]): readonly AssessmentBlueprintItem[] {
  return groups.flatMap((group) => Array.from({ length: group.count }, () => ({
    questionType: group.questionType,
    cognitiveLevel: group.cognitiveLevel,
    marks: group.marks,
    ...(group.difficultyLevel ? { difficultyLevel: group.difficultyLevel } : {}),
  })));
}

const GRADES_5_TO_8_BLUEPRINT: readonly AssessmentBlueprintItem[] = [
  { questionType: "اختيار من متعدد", cognitiveLevel: "معرفة", marks: 1 },
  { questionType: "اختيار من متعدد", cognitiveLevel: "تطبيق", marks: 1 },
  { questionType: "اختيار من متعدد", cognitiveLevel: "استدلال", marks: 1 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "معرفة", marks: 2 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "معرفة", marks: 2 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "معرفة", marks: 1 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "تطبيق", marks: 2 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "تطبيق", marks: 2 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "تطبيق", marks: 1 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "استدلال", marks: 2 },
];

const GRADE_9_BLUEPRINT: readonly AssessmentBlueprintItem[] = [
  { questionType: "اختيار من متعدد", cognitiveLevel: "معرفة", marks: 1 },
  { questionType: "اختيار من متعدد", cognitiveLevel: "تطبيق", marks: 1 },
  { questionType: "اختيار من متعدد", cognitiveLevel: "استدلال", marks: 1 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "معرفة", marks: 2 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "معرفة", marks: 2 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "معرفة", marks: 1 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "تطبيق", marks: 2 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "استدلال", marks: 2 },
  { questionType: "إجابة طويلة", cognitiveLevel: "تطبيق", marks: 3 },
];

const GRADE_10_BLUEPRINT: readonly AssessmentBlueprintItem[] = [
  { questionType: "اختيار من متعدد", cognitiveLevel: "معرفة", marks: 1 },
  { questionType: "اختيار من متعدد", cognitiveLevel: "تطبيق", marks: 1 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "معرفة", marks: 2 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "معرفة", marks: 1 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "استدلال", marks: 2 },
  { questionType: "إجابة طويلة", cognitiveLevel: "تطبيق", marks: 3 },
];

const GRADES_5_TO_8_FINAL_BLUEPRINT = expandBlueprint([
  { questionType: "اختيار من متعدد", cognitiveLevel: "معرفة", difficultyLevel: "منخفض", marks: 1, count: 2 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "معرفة", difficultyLevel: "منخفض", marks: 2, count: 3 },
  { questionType: "اختيار من متعدد", cognitiveLevel: "معرفة", difficultyLevel: "متوسط", marks: 1, count: 2 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "معرفة", difficultyLevel: "متوسط", marks: 2, count: 2 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "معرفة", difficultyLevel: "مرتفع", marks: 2, count: 1 },
  { questionType: "اختيار من متعدد", cognitiveLevel: "تطبيق", difficultyLevel: "منخفض", marks: 1, count: 2 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "تطبيق", difficultyLevel: "منخفض", marks: 2, count: 2 },
  { questionType: "اختيار من متعدد", cognitiveLevel: "تطبيق", difficultyLevel: "متوسط", marks: 1, count: 1 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "تطبيق", difficultyLevel: "متوسط", marks: 2, count: 3 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "تطبيق", difficultyLevel: "مرتفع", marks: 2, count: 1 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "تطبيق", difficultyLevel: "مرتفع", marks: 1, count: 1 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "استدلال", difficultyLevel: "منخفض", marks: 2, count: 1 },
  { questionType: "اختيار من متعدد", cognitiveLevel: "استدلال", difficultyLevel: "متوسط", marks: 1, count: 1 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "استدلال", difficultyLevel: "متوسط", marks: 2, count: 1 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "استدلال", difficultyLevel: "مرتفع", marks: 2, count: 1 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "استدلال", difficultyLevel: "مرتفع", marks: 1, count: 1 },
]);

const GRADE_9_FINAL_BLUEPRINT = expandBlueprint([
  { questionType: "اختيار من متعدد", cognitiveLevel: "معرفة", difficultyLevel: "منخفض", marks: 1, count: 2 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "معرفة", difficultyLevel: "منخفض", marks: 2, count: 3 },
  { questionType: "اختيار من متعدد", cognitiveLevel: "معرفة", difficultyLevel: "متوسط", marks: 1, count: 2 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "معرفة", difficultyLevel: "متوسط", marks: 2, count: 1 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "معرفة", difficultyLevel: "متوسط", marks: 1, count: 1 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "معرفة", difficultyLevel: "مرتفع", marks: 2, count: 1 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "معرفة", difficultyLevel: "مرتفع", marks: 1, count: 1 },
  { questionType: "إجابة طويلة", cognitiveLevel: "تطبيق", difficultyLevel: "منخفض", marks: 4, count: 1 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "تطبيق", difficultyLevel: "منخفض", marks: 1, count: 2 },
  { questionType: "اختيار من متعدد", cognitiveLevel: "تطبيق", difficultyLevel: "متوسط", marks: 1, count: 1 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "تطبيق", difficultyLevel: "متوسط", marks: 2, count: 3 },
  { questionType: "اختيار من متعدد", cognitiveLevel: "تطبيق", difficultyLevel: "مرتفع", marks: 1, count: 2 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "تطبيق", difficultyLevel: "مرتفع", marks: 1, count: 1 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "استدلال", difficultyLevel: "منخفض", marks: 2, count: 1 },
  { questionType: "إجابة طويلة", cognitiveLevel: "استدلال", difficultyLevel: "متوسط", marks: 4, count: 1 },
  { questionType: "اختيار من متعدد", cognitiveLevel: "استدلال", difficultyLevel: "مرتفع", marks: 1, count: 1 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "استدلال", difficultyLevel: "مرتفع", marks: 1, count: 1 },
]);

const GRADE_10_FINAL_BLUEPRINT = expandBlueprint([
  { questionType: "اختيار من متعدد", cognitiveLevel: "معرفة", difficultyLevel: "منخفض", marks: 1, count: 2 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "معرفة", difficultyLevel: "منخفض", marks: 2, count: 4 },
  { questionType: "اختيار من متعدد", cognitiveLevel: "معرفة", difficultyLevel: "متوسط", marks: 1, count: 2 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "معرفة", difficultyLevel: "متوسط", marks: 2, count: 4 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "معرفة", difficultyLevel: "مرتفع", marks: 2, count: 2 },
  { questionType: "إجابة طويلة", cognitiveLevel: "تطبيق", difficultyLevel: "منخفض", marks: 4, count: 1 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "تطبيق", difficultyLevel: "منخفض", marks: 2, count: 3 },
  { questionType: "اختيار من متعدد", cognitiveLevel: "تطبيق", difficultyLevel: "متوسط", marks: 1, count: 4 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "تطبيق", difficultyLevel: "متوسط", marks: 2, count: 2 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "تطبيق", difficultyLevel: "متوسط", marks: 1, count: 2 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "تطبيق", difficultyLevel: "مرتفع", marks: 2, count: 2 },
  { questionType: "اختيار من متعدد", cognitiveLevel: "استدلال", difficultyLevel: "منخفض", marks: 1, count: 2 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "استدلال", difficultyLevel: "منخفض", marks: 2, count: 1 },
  { questionType: "إجابة طويلة", cognitiveLevel: "استدلال", difficultyLevel: "متوسط", marks: 4, count: 1 },
  { questionType: "إجابة قصيرة", cognitiveLevel: "استدلال", difficultyLevel: "مرتفع", marks: 2, count: 2 },
]);

const GRADES_5_TO_8_SPEC: OfficialShortTestSpec = {
  assessmentType: "اختبار قصير رسمي",
  gradeFrom: 5,
  gradeTo: 8,
  totalMarks: 15,
  durationLabel: "حصة دراسية واحدة",
  defaultDurationMinutes: 40,
  minItems: 8,
  maxItems: 12,
  cognitiveMarks: { معرفة: 6, تطبيق: 6, استدلال: 3 },
  counts: { mcq: 3, short: 7, long: 0 },
  blueprint: GRADES_5_TO_8_BLUEPRINT,
  notes: [
    "ثلاث مفردات اختيار من متعدد تغطي هدفي تقويم على الأقل.",
    "من خمس إلى تسع مفردات ذات إجابة قصيرة.",
    "لا تستخدم مفردات الإجابة الطويلة في الصفوف 5-8.",
  ],
};

const GRADE_9_SPEC: OfficialShortTestSpec = {
  assessmentType: "اختبار قصير رسمي",
  gradeFrom: 9,
  gradeTo: 9,
  totalMarks: 15,
  durationLabel: "حصة دراسية واحدة",
  defaultDurationMinutes: 40,
  minItems: 8,
  maxItems: 12,
  cognitiveMarks: { معرفة: 6, تطبيق: 6, استدلال: 3 },
  counts: { mcq: 3, short: 5, long: 1 },
  blueprint: GRADE_9_BLUEPRINT,
  notes: [
    "ثلاث مفردات اختيار من متعدد تغطي هدفي تقويم على الأقل.",
    "مفردة واحدة ذات إجابة طويلة.",
    "توزع بقية الدرجات على مفردات الإجابة القصيرة.",
  ],
};

const GRADE_10_SPEC: OfficialShortTestSpec = {
  assessmentType: "اختبار قصير رسمي",
  gradeFrom: 10,
  gradeTo: 10,
  totalMarks: 10,
  durationLabel: "حصة دراسية واحدة",
  defaultDurationMinutes: 40,
  minItems: 5,
  maxItems: 7,
  cognitiveMarks: { معرفة: 4, تطبيق: 4, استدلال: 2 },
  counts: { mcq: 2, short: 3, long: 1 },
  blueprint: GRADE_10_BLUEPRINT,
  notes: [
    "مفردتان اختيار من متعدد: واحدة للمعرفة وواحدة للتطبيق.",
    "مفردة واحدة ذات إجابة طويلة.",
    "توزع بقية الدرجات على مفردات الإجابة القصيرة.",
  ],
};

const GRADES_5_TO_8_FINAL_SPEC: OfficialFinalExamSpec = {
  assessmentType: "امتحان نهاية الفصل الدراسي",
  gradeFrom: 5,
  gradeTo: 8,
  totalMarks: 40,
  durationLabel: "ساعة ونصف",
  defaultDurationMinutes: 90,
  minItems: 25,
  maxItems: 35,
  cognitiveMarks: { معرفة: 16, تطبيق: 16, استدلال: 8 },
  difficultyMarks: { منخفض: 16, متوسط: 16, مرتفع: 8 },
  counts: { mcq: 8, short: 17, long: 0 },
  blueprint: GRADES_5_TO_8_FINAL_BLUEPRINT,
  notes: [
    "ثمان مفردات اختيار من متعدد بدرجة واحدة لكل مفردة.",
    "توزع بقية الدرجات على مفردات الإجابة القصيرة.",
    "تخصص من 6 إلى 8 درجات للاستقصاء العلمي.",
  ],
};

const GRADE_9_FINAL_SPEC: OfficialFinalExamSpec = {
  assessmentType: "امتحان نهاية الفصل الدراسي",
  gradeFrom: 9,
  gradeTo: 9,
  totalMarks: 40,
  durationLabel: "ساعة ونصف",
  defaultDurationMinutes: 90,
  minItems: 25,
  maxItems: 35,
  cognitiveMarks: { معرفة: 16, تطبيق: 16, استدلال: 8 },
  difficultyMarks: { منخفض: 16, متوسط: 16, مرتفع: 8 },
  counts: { mcq: 8, short: 15, long: 2 },
  blueprint: GRADE_9_FINAL_BLUEPRINT,
  notes: [
    "ثمان مفردات اختيار من متعدد بدرجة واحدة لكل مفردة.",
    "مفردتان على الأقل من مفردات الإجابة الطويلة.",
    "تخصص من 6 إلى 8 درجات للاستقصاء العلمي.",
  ],
};

const GRADE_10_FINAL_SPEC: OfficialFinalExamSpec = {
  assessmentType: "امتحان نهاية الفصل الدراسي",
  gradeFrom: 10,
  gradeTo: 10,
  totalMarks: 60,
  durationLabel: "ساعتان",
  defaultDurationMinutes: 120,
  minItems: 30,
  maxItems: 40,
  cognitiveMarks: { معرفة: 24, تطبيق: 24, استدلال: 12 },
  difficultyMarks: { منخفض: 24, متوسط: 24, مرتفع: 12 },
  counts: { mcq: 10, short: 22, long: 2 },
  blueprint: GRADE_10_FINAL_BLUEPRINT,
  notes: [
    "عشر مفردات اختيار من متعدد بدرجة واحدة لكل مفردة.",
    "مفردتان على الأقل من مفردات الإجابة الطويلة.",
    "تخصص من 8 إلى 10 درجات للاستقصاء العلمي.",
  ],
};

export const OFFICIAL_SHORT_TEST_SPECS: readonly OfficialShortTestSpec[] = [
  GRADES_5_TO_8_SPEC,
  GRADE_9_SPEC,
  GRADE_10_SPEC,
];

export const OFFICIAL_FINAL_EXAM_SPECS: readonly OfficialFinalExamSpec[] = [
  GRADES_5_TO_8_FINAL_SPEC,
  GRADE_9_FINAL_SPEC,
  GRADE_10_FINAL_SPEC,
];

export function isOfficialScienceGrade(grade: number | null): grade is OfficialScienceGrade {
  return grade !== null && Number.isInteger(grade) && grade >= 5 && grade <= 10;
}

export function assessmentTypeForTitle(title: ExamTitleOption): OfficialAssessmentType {
  return title === "الاختبار النهائي" ? "امتحان نهاية الفصل الدراسي" : "اختبار قصير رسمي";
}

export function isExamTitleOption(value: string): value is ExamTitleOption {
  return (EXAM_TITLE_OPTIONS as readonly string[]).includes(value);
}

export function getOfficialShortTestSpec(grade: number | null): OfficialShortTestSpec | null {
  if (!isOfficialScienceGrade(grade)) return null;
  return OFFICIAL_SHORT_TEST_SPECS.find((spec) => grade >= spec.gradeFrom && grade <= spec.gradeTo) ?? null;
}

export function getOfficialFinalExamSpec(grade: number | null): OfficialFinalExamSpec | null {
  if (!isOfficialScienceGrade(grade)) return null;
  return OFFICIAL_FINAL_EXAM_SPECS.find((spec) => grade >= spec.gradeFrom && grade <= spec.gradeTo) ?? null;
}

export function getOfficialAssessmentSpec(grade: number | null, title: ExamTitleOption): OfficialAssessmentSpec | null {
  return title === "الاختبار النهائي" ? getOfficialFinalExamSpec(grade) : getOfficialShortTestSpec(grade);
}

export function blueprintMarks(blueprint: readonly AssessmentBlueprintItem[]): number {
  return blueprint.reduce((total, item) => total + item.marks, 0);
}

export function blueprintCounts(blueprint: readonly AssessmentBlueprintItem[]): QuestionCounts {
  return blueprint.reduce<QuestionCounts>((counts, item) => {
    if (item.questionType === "اختيار من متعدد") counts.mcq += 1;
    else if (item.questionType === "إجابة قصيرة") counts.short += 1;
    else counts.long += 1;
    return counts;
  }, { mcq: 0, short: 0, long: 0 });
}

export function blueprintCognitiveMarks(
  blueprint: readonly AssessmentBlueprintItem[],
): Record<CognitiveLevel, number> {
  return blueprint.reduce<Record<CognitiveLevel, number>>((marks, item) => {
    marks[item.cognitiveLevel] += item.marks;
    return marks;
  }, { معرفة: 0, تطبيق: 0, استدلال: 0 });
}

export function blueprintDifficultyMarks(
  blueprint: readonly AssessmentBlueprintItem[],
): Record<ItemDifficulty, number> {
  return blueprint.reduce<Record<ItemDifficulty, number>>((marks, item) => {
    if (item.difficultyLevel) marks[item.difficultyLevel] += item.marks;
    return marks;
  }, { منخفض: 0, متوسط: 0, مرتفع: 0 });
}

export const ASSESSMENT_ITEM_WRITING_RULES = {
  multipleChoice: [
    "درجة واحدة وهدف تعلم واحد لكل مفردة.",
    "أربعة بدائل فقط، وإجابة صحيحة واحدة.",
    "المشتتات مقنعة ومرتبطة بالموضوع لكنها خاطئة تمامًا.",
    "يمنع: جميع ما سبق، لا شيء مما سبق، والأول والثاني فقط.",
  ],
  shortAnswer: [
    "درجة أو درجتان فقط.",
    "تحدد الإجابة المطلوبة بوضوح: كلمة، عدد، جملة قصيرة، إكمال أو تفسير مختصر.",
  ],
  longAnswer: [
    "للصفين 9 و10 فقط، وثلاث أو أربع درجات.",
    "تتطلب شرحًا أو تحليلًا أو أدلة أو خطوات حل، ولا تكون مجرد استرجاع أو سرد نقاط.",
    "لا يزيد السؤال على فعلي أمر مترابطين.",
  ],
  general: [
    "تستند المفردة إلى منهج الفصل الدراسي وتستخدم مصطلحاته الرسمية.",
    "يتوافق فعل الأمر مع هدف التعلم وهدف التقويم.",
    "تجنب النفي، وإن لزم فيبرز لفظ النفي بوضوح.",
    "تكون الجمل قصيرة وواضحة، وتحدد الدرجة بين قوسين مربعين.",
    "لا تمنح فرصة تخمين تتجاوز 25%.",
  ],
} as const;
