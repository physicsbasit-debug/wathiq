import type { AssessmentType, Difficulty, ExamTitleOption, QuestionCounts } from "./types.js";

/** سياسة واثق الداخلية لضبط الجودة، وليست ادعاءً بأنها مواصفة ورقة Cambridge رسمية. */
export const CAMBRIDGE_ASSESSMENT_POLICY_ID = "wathiq-cambridge-science-quality-v1";

export const EXAM_TITLE_OPTIONS = [
  "اختبار قصير",
  "اختبار تدريبي",
  "اختبار شامل",
] as const satisfies readonly ExamTitleOption[];

export interface WathiqAssessmentPreset {
  title: ExamTitleOption;
  assessmentType: AssessmentType;
  durationMinutes: number;
  totalMarks: number;
  counts: QuestionCounts;
}

const PRESETS: Readonly<Record<ExamTitleOption, WathiqAssessmentPreset>> = {
  "اختبار قصير": {
    title: "اختبار قصير",
    assessmentType: "اختبار قصير",
    durationMinutes: 20,
    totalMarks: 10,
    counts: { mcq: 2, short: 4, long: 0 },
  },
  "اختبار تدريبي": {
    title: "اختبار تدريبي",
    assessmentType: "اختبار تدريبي",
    durationMinutes: 40,
    totalMarks: 20,
    counts: { mcq: 4, short: 6, long: 1 },
  },
  "اختبار شامل": {
    title: "اختبار شامل",
    assessmentType: "اختبار شامل",
    durationMinutes: 60,
    totalMarks: 40,
    counts: { mcq: 8, short: 12, long: 2 },
  },
};

export function assessmentPreset(title: ExamTitleOption): WathiqAssessmentPreset {
  return PRESETS[title];
}

export function assessmentTypeForTitle(title: ExamTitleOption): AssessmentType {
  return assessmentPreset(title).assessmentType;
}

export function isExamTitleOption(value: string): value is ExamTitleOption {
  return (EXAM_TITLE_OPTIONS as readonly string[]).includes(value);
}

export function suggestedCountsForMarks(totalMarks: number, difficulty: Difficulty): QuestionCounts {
  const marks = Math.max(5, Math.min(80, Math.round(totalMarks)));
  const long = difficulty === "متقدم" ? Math.max(1, Math.floor(marks / 16)) : Math.floor(marks / 20);
  const remainingAfterLong = Math.max(0, marks - long * 4);
  const mcq = Math.max(1, Math.round(remainingAfterLong * 0.25));
  const shortMarks = Math.max(0, remainingAfterLong - mcq);
  const short = Math.floor(shortMarks / 2);
  const remainder = marks - (mcq + short * 2 + long * 4);
  return { mcq: mcq + Math.max(0, remainder), short, long };
}
