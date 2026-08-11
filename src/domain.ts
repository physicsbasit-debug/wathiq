import {
  CAMBRIDGE_ASSESSMENT_POLICY_ID,
  assessmentPreset,
  assessmentTypeForTitle,
  isExamTitleOption,
  suggestedCountsForMarks,
} from "./cambridge-assessment.js";
import {
  defaultStageForProgramme,
  isKnownTopicForSelection,
  isStageValidForProgramme,
  subjectProfile,
  syllabusCodeFor,
} from "./cambridge-curriculum.js";
import type {
  CognitiveLevel,
  Difficulty,
  ExamDraft,
  ExamTitleOption,
  PlanItem,
  QuestionCounts,
  QuestionProposal,
  QuestionType,
  SpecValidation,
} from "./types.js";

export const MIN_LESSON_TOPICS = 1;
export const MAX_LESSON_TOPICS = 5;

export const MARKS_BY_TYPE: Readonly<Record<keyof QuestionCounts, number>> = {
  mcq: 1,
  short: 2,
  long: 4,
};

export function getAcademicYear(date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const academicStart = month >= 8 ? year : year - 1;
  return `${academicStart}/${academicStart + 1}`;
}

export function toDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createEmptyDraft(now = new Date()): ExamDraft {
  const academicYear = getAcademicYear(now);
  const programmeId = "primary" as const;
  const grade = defaultStageForProgramme(programmeId);
  const title: ExamTitleOption = "اختبار قصير";
  const preset = assessmentPreset(title);
  return {
    id: `draft-${now.getTime()}`,
    assessmentType: assessmentTypeForTitle(title),
    assessmentPolicyId: CAMBRIDGE_ASSESSMENT_POLICY_ID,
    programmeId,
    syllabusCode: syllabusCodeFor(programmeId, "science"),
    grade,
    subjectId: "science",
    lessonTopics: [],
    topic: "",
    title,
    examDate: toDateInputValue(now),
    school: "",
    academicYear,
    durationMinutes: preset.durationMinutes,
    totalMarks: preset.totalMarks,
    difficulty: "متوسط",
    visualJobs: {},
    generationMode: "progressive_items_v1",
    generationRunId: "",
    generationEpoch: 1,
    counts: { ...preset.counts },
    plan: [],
    selectedProposalByPlanItem: {},
    generationVersion: "",
    generationModel: "",
    generatedAt: "",
    approvedAt: "",
    currentStep: 1,
    updatedAt: now.toISOString(),
    status: "مسودة",
  };
}

export function applyAssessmentPreset(draft: ExamDraft): ExamDraft {
  const preset = assessmentPreset(draft.title);
  draft.assessmentType = preset.assessmentType;
  draft.assessmentPolicyId = CAMBRIDGE_ASSESSMENT_POLICY_ID;
  draft.totalMarks = preset.totalMarks;
  draft.durationMinutes = preset.durationMinutes;
  draft.counts = { ...preset.counts };
  draft.difficulty = "متوسط";
  resetGeneratedState(draft);
  return draft;
}

export function setExamTitle(draft: ExamDraft, title: ExamTitleOption): ExamDraft {
  draft.title = title;
  return applyAssessmentPreset(draft);
}

export function setCambridgeProgramme(draft: ExamDraft, programmeId: ExamDraft["programmeId"]): ExamDraft {
  draft.programmeId = programmeId;
  draft.grade = defaultStageForProgramme(programmeId);
  draft.subjectId = programmeId === "igcse" ? "" : "science";
  draft.syllabusCode = draft.subjectId ? syllabusCodeFor(programmeId, draft.subjectId) : "";
  draft.lessonTopics = [];
  draft.topic = "";
  resetGeneratedState(draft);
  return draft;
}

export function setCambridgeSubject(draft: ExamDraft, subjectId: string): ExamDraft {
  draft.subjectId = subjectId;
  draft.syllabusCode = subjectId ? syllabusCodeFor(draft.programmeId, subjectId) : "";
  resetGeneratedState(draft);
  return draft;
}

function resetGeneratedState(draft: ExamDraft): void {
  draft.plan = [];
  draft.selectedProposalByPlanItem = {};
  draft.visualJobs = {};
  draft.generationRunId = "";
  draft.generationEpoch = Math.max(1, draft.generationEpoch + 1);
  draft.generationVersion = "";
  draft.generationModel = "";
  draft.generatedAt = "";
  draft.approvedAt = "";
  draft.status = "مسودة";
}

export function approveExamDraft(draft: ExamDraft, approvedAt = new Date().toISOString()): ExamDraft {
  draft.status = "معتمد";
  draft.approvedAt = approvedAt;
  draft.currentStep = 4;
  return draft;
}

export function reopenExamDraft(draft: ExamDraft): ExamDraft {
  draft.status = "جاهز للمراجعة";
  draft.approvedAt = "";
  return draft;
}

export function normalizeLessonTopics(values: readonly string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function lessonTopicKey(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/ـ/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function syncDraftTopicFromLessons(draft: ExamDraft): string {
  const lessons = normalizeLessonTopics(draft.lessonTopics);
  draft.topic = lessons.join("، ");
  return draft.topic;
}

function uniqueLessonTopics(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of normalizeLessonTopics(values)) {
    const key = lessonTopicKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

export function computeMarks(counts: QuestionCounts): number {
  return counts.mcq * MARKS_BY_TYPE.mcq + counts.short * MARKS_BY_TYPE.short + counts.long * MARKS_BY_TYPE.long;
}

export function validateExamSetup(draft: ExamDraft): SpecValidation {
  const issues: SpecValidation["issues"] = [];
  const computedMarks = computeMarks(draft.counts);
  const lessonTopics = normalizeLessonTopics(draft.lessonTopics);
  const uniqueLessons = uniqueLessonTopics(draft.lessonTopics);

  if (!isStageValidForProgramme(draft.programmeId, draft.grade)) {
    issues.push({ field: "grade", message: "اختر مرحلة كامبريدج صحيحة." });
  }
  if (!draft.subjectId || !subjectProfile(draft.programmeId, draft.subjectId)) {
    issues.push({ field: "subject", message: "اختر مادة علوم متاحة في مسار كامبريدج المحدد." });
  }
  if (lessonTopics.length < MIN_LESSON_TOPICS || lessonTopics.length > MAX_LESSON_TOPICS) {
    issues.push({ field: "lessons", message: `اختر من ${MIN_LESSON_TOPICS} إلى ${MAX_LESSON_TOPICS} موضوعات أو دروس.` });
  } else if (uniqueLessons.length !== lessonTopics.length) {
    issues.push({ field: "lessons", message: "لا تكرر الموضوع نفسه داخل الاختبار." });
  } else if (lessonTopics.some((topic) => !isKnownTopicForSelection(draft.programmeId, draft.subjectId, draft.grade, topic))) {
    issues.push({ field: "lessons", message: "اختر الموضوعات من قائمة كامبريدج المناسبة للصف والمادة." });
  }
  if (!draft.topic.trim()) issues.push({ field: "topic", message: "أدخل موضوع الاختبار." });
  if (!isExamTitleOption(draft.title)) issues.push({ field: "title", message: "اختر نوع الاختبار." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.examDate)) issues.push({ field: "date", message: "اختر تاريخ الاختبار." });
  if (draft.durationMinutes < 5 || draft.durationMinutes > 180) {
    issues.push({ field: "duration", message: "اجعل زمن الاختبار بين 5 و180 دقيقة." });
  }
  if (draft.totalMarks < 5 || draft.totalMarks > 80) {
    issues.push({ field: "marks", message: "اجعل الدرجة الكلية بين 5 و80 درجة." });
  }
  const totalQuestions = draft.counts.mcq + draft.counts.short + draft.counts.long;
  if (totalQuestions === 0) issues.push({ field: "counts", message: "أضف سؤالًا واحدًا على الأقل." });
  if (totalQuestions > 30) issues.push({ field: "counts", message: "يدعم واثق حتى 30 مفردة في الاختبار الواحد." });
  if (computedMarks !== draft.totalMarks) {
    issues.push({ field: "counts", message: `مجموع درجات المفردات ${computedMarks}، بينما الدرجة الكلية ${draft.totalMarks}.` });
  }

  const expectedCode = draft.subjectId ? syllabusCodeFor(draft.programmeId, draft.subjectId) : "";
  if (expectedCode && draft.syllabusCode !== expectedCode) draft.syllabusCode = expectedCode;
  draft.assessmentPolicyId = CAMBRIDGE_ASSESSMENT_POLICY_ID;

  const result: SpecValidation = { valid: issues.length === 0, issues, computedMarks };
  if (computedMarks !== draft.totalMarks) result.suggestedCounts = suggestedCountsForMarks(draft.totalMarks, draft.difficulty);
  return result;
}

export function suggestCountsForMarks(totalMarks: number, difficulty: Difficulty): QuestionCounts {
  return suggestedCountsForMarks(totalMarks, difficulty);
}

function cognitiveCycle(difficulty: Difficulty): CognitiveLevel[] {
  if (difficulty === "سهل") return ["معرفة", "معرفة", "تطبيق"];
  if (difficulty === "متقدم") return ["تطبيق", "استدلال", "استدلال"];
  return ["معرفة", "تطبيق", "استدلال"];
}

function questionEntries(counts: QuestionCounts): Array<{ type: QuestionType; marks: number }> {
  return [
    ...Array.from({ length: counts.mcq }, () => ({ type: "اختيار من متعدد" as const, marks: 1 })),
    ...Array.from({ length: counts.short }, () => ({ type: "إجابة قصيرة" as const, marks: 2 })),
    ...Array.from({ length: counts.long }, () => ({ type: "إجابة طويلة" as const, marks: 4 })),
  ];
}

export function buildPlan(draft: ExamDraft): PlanItem[] {
  const lessons = uniqueLessonTopics(draft.lessonTopics);
  if (lessons.length < MIN_LESSON_TOPICS || lessons.length > MAX_LESSON_TOPICS) {
    throw new Error(`تعذر بناء الخطة: أدخل ${MIN_LESSON_TOPICS}-${MAX_LESSON_TOPICS} موضوعات مختلفة.`);
  }
  syncDraftTopicFromLessons(draft);
  const cycle = cognitiveCycle(draft.difficulty);
  const entries = questionEntries(draft.counts).map((entry, index) => ({
    ...entry,
    level: cycle[index % cycle.length] ?? "معرفة",
  }));

  return entries.map((entry, index) => {
    const lessonIndex = index % lessons.length;
    const lesson = lessons[lessonIndex];
    if (!lesson) throw new Error("تعذر توزيع مفردات الخطة على الموضوعات.");
    return {
      id: `plan-${index + 1}`,
      lessonId: `topic-${lessonIndex + 1}`,
      lessonLabel: lesson,
      cognitiveLevel: entry.level,
      questionType: entry.type,
      marks: entry.marks,
      proposals: [],
    };
  });
}

export function isPlanComplete(draft: ExamDraft): boolean {
  return draft.plan.length > 0 && draft.plan.every((item) => {
    const selectedId = draft.selectedProposalByPlanItem[item.id];
    return Boolean(selectedId && item.proposals.some((proposal) => proposal.id === selectedId));
  });
}

export function selectedProposal(draft: ExamDraft, item: PlanItem): QuestionProposal | undefined {
  const proposalId = draft.selectedProposalByPlanItem[item.id];
  return item.proposals.find((proposal) => proposal.id === proposalId);
}
