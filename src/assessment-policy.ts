import type { CognitiveLevel, QuestionCounts, QuestionType } from "./types.js";

export const SCIENCE_ASSESSMENT_POLICY_ID = "oman-science-assessment-2025-2026";
export const SCIENCE_ASSESSMENT_POLICY_TITLE = "وثيقة تقويم تعلّم الطلبة في مواد العلوم للصفوف (5-10)";
export const SCIENCE_ASSESSMENT_POLICY_VERSION = "2025/2026";
export const SCIENCE_ASSESSMENT_POLICY_PUBLISHED = "سبتمبر 2025";
export const SCIENCE_ASSESSMENT_POLICY_DOCUMENT_PATH = "./references/science-assessment-policy-2025-2026.pdf";

export type OfficialScienceGrade = 5 | 6 | 7 | 8 | 9 | 10;

export interface AssessmentBlueprintItem {
  questionType: QuestionType;
  cognitiveLevel: CognitiveLevel;
  marks: 1 | 2 | 3 | 4;
}

export interface OfficialShortTestSpec {
  gradeFrom: OfficialScienceGrade;
  gradeTo: OfficialScienceGrade;
  totalMarks: 10 | 15;
  durationLabel: "حصة دراسية واحدة";
  defaultDurationMinutes: 40;
  minItems: number;
  maxItems: number;
  cognitiveMarks: Readonly<Record<CognitiveLevel, number>>;
  counts: Readonly<QuestionCounts>;
  blueprint: readonly AssessmentBlueprintItem[];
  notes: readonly string[];
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

const GRADES_5_TO_8_SPEC: OfficialShortTestSpec = {
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

export const OFFICIAL_SHORT_TEST_SPECS: readonly OfficialShortTestSpec[] = [
  GRADES_5_TO_8_SPEC,
  GRADE_9_SPEC,
  GRADE_10_SPEC,
];

export function isOfficialScienceGrade(grade: number | null): grade is OfficialScienceGrade {
  return grade !== null && Number.isInteger(grade) && grade >= 5 && grade <= 10;
}

export function getOfficialShortTestSpec(grade: number | null): OfficialShortTestSpec | null {
  if (!isOfficialScienceGrade(grade)) return null;
  return OFFICIAL_SHORT_TEST_SPECS.find((spec) => grade >= spec.gradeFrom && grade <= spec.gradeTo) ?? null;
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
