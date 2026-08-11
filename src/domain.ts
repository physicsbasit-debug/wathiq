import {
  CAMBRIDGE_ASSESSMENT_POLICY_ID,
  assessmentPreset,
  assessmentSpecification,
  assessmentTypeForTitle,
  buildAssessmentEntries,
  cognitiveLevelsForEntries,
  difficultyLevelsForEntries,
  inquiryFlagsForEntries,
  isExamTitleOption,
} from "./cambridge-assessment.js";
import {
  defaultStageForProgramme,
  isKnownTopicForSelection,
  isStageValidForProgramme,
  subjectProfile,
  syllabusCodeFor,
} from "./cambridge-curriculum.js";
import type {
  ExamDraft,
  ExamTitleOption,
  PlanItem,
  QuestionProposal,
  SpecValidation,
} from "./types.js";

export const MIN_LESSON_TOPICS = 1;
export const MAX_LESSON_TOPICS = 5;

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
  const title: ExamTitleOption = "الاختبار القصير الأول";
  const preset = assessmentPreset(title, grade);
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
  const preset = assessmentPreset(draft.title, draft.grade);
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

export function validateExamSetup(draft: ExamDraft): SpecValidation {
  const issues: SpecValidation["issues"] = [];
  const spec = assessmentSpecification(draft.grade, draft.title);
  const entries = buildAssessmentEntries(spec);
  const computedMarks = entries.reduce((sum, item) => sum + item.marks, 0);
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
  if (draft.durationMinutes !== spec.durationMinutes) {
    issues.push({ field: "duration", message: `زمن الاختبار يجب أن يطابق جدول المواصفات: ${spec.durationMinutes} دقيقة.` });
  }
  if (draft.totalMarks !== spec.totalMarks) {
    issues.push({ field: "marks", message: `الدرجة الكلية يجب أن تطابق جدول المواصفات: ${spec.totalMarks} درجة.` });
  }
  const totalQuestions = draft.counts.mcq + draft.counts.short + draft.counts.long;
  if (totalQuestions !== spec.operationalItemCount) {
    issues.push({ field: "counts", message: `عدد المفردات التشغيلي المعتمد في واثق لهذا القالب هو ${spec.operationalItemCount}.` });
  }
  if (draft.counts.mcq !== spec.counts.mcq || draft.counts.short !== spec.counts.short || draft.counts.long !== spec.counts.long) {
    issues.push({ field: "counts", message: "أنواع المفردات لا تطابق جدول المواصفات المعتمد." });
  }
  if (computedMarks !== spec.totalMarks) {
    issues.push({ field: "counts", message: `تعذر تحقيق الدرجة الكلية لجدول المواصفات (${spec.totalMarks}).` });
  }

  const expectedCode = draft.subjectId ? syllabusCodeFor(draft.programmeId, draft.subjectId) : "";
  if (expectedCode && draft.syllabusCode !== expectedCode) draft.syllabusCode = expectedCode;
  draft.assessmentPolicyId = CAMBRIDGE_ASSESSMENT_POLICY_ID;

  return { valid: issues.length === 0, issues, computedMarks };
}

export function buildPlan(draft: ExamDraft): PlanItem[] {
  const lessons = uniqueLessonTopics(draft.lessonTopics);
  if (lessons.length < MIN_LESSON_TOPICS || lessons.length > MAX_LESSON_TOPICS) {
    throw new Error(`تعذر بناء الخطة: أدخل ${MIN_LESSON_TOPICS}-${MAX_LESSON_TOPICS} موضوعات مختلفة.`);
  }
  syncDraftTopicFromLessons(draft);
  const spec = assessmentSpecification(draft.grade, draft.title);
  const entries = buildAssessmentEntries(spec);
  const cognitiveLevels = cognitiveLevelsForEntries(entries, spec);
  const difficultyLevels = difficultyLevelsForEntries(entries, spec);
  const inquiryFlags = inquiryFlagsForEntries(entries, spec);

  return entries.map((entry, index) => {
    const lessonIndex = index % lessons.length;
    const lesson = lessons[lessonIndex];
    if (!lesson) throw new Error("تعذر توزيع مفردات الخطة على الموضوعات.");
    return {
      id: `plan-${index + 1}`,
      lessonId: `topic-${lessonIndex + 1}`,
      lessonLabel: lesson,
      cognitiveLevel: cognitiveLevels[index] ?? "معرفة",
      ...(difficultyLevels[index] ? { difficultyLevel: difficultyLevels[index] } : {}),
      ...(inquiryFlags[index] ? { assessmentFocus: "استقصاء علمي" as const } : {}),
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
