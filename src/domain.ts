import {
  SCIENCE_ASSESSMENT_POLICY_ID,
  assessmentTypeForTitle,
  blueprintCounts,
  blueprintMarks,
  getOfficialAssessmentSpec,
  isExamTitleOption,
} from "./assessment-policy.js";
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

export const MIN_LESSON_TOPICS = 2;
export const MAX_LESSON_TOPICS = 5;

export const MARKS_BY_TYPE: Readonly<Record<keyof QuestionCounts, number>> = {
  mcq: 1,
  short: 2,
  long: 4,
};

export function getAcademicContext(date = new Date()): { academicYear: string; semester: string } {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const academicStart = month >= 8 ? year : year - 1;
  const semester = month >= 8 || month <= 1 ? "الأول" : "الثاني";
  return { academicYear: `${academicStart}/${academicStart + 1}`, semester };
}

export function toDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createEmptyDraft(now = new Date()): ExamDraft {
  const context = getAcademicContext(now);
  return {
    id: `draft-${now.getTime()}`,
    assessmentType: "اختبار قصير رسمي",
    assessmentPolicyId: SCIENCE_ASSESSMENT_POLICY_ID,
    grade: null,
    subjectId: "",
    unitId: "",
    lessonIds: [],
    outcomeIds: [],
    lessonTopics: ["", ""],
    topic: "",
    sourceReferences: [],
    sourceRetrievalVersion: "",
    title: "الاختبار القصير الأول",
    examDate: toDateInputValue(now),
    school: "مدرسة الباسط للتعليم الأساسي",
    directorate: "محافظة جنوب الباطنة",
    academicYear: context.academicYear,
    semester: context.semester,
    durationMinutes: 40,
    totalMarks: 10,
    difficulty: "متوسط",
    trustedEnrichmentEnabled: true,
    visualEnhancementEnabled: true,
    visualJobs: {},
    generationMode: "progressive_items_v1",
    generationRunId: "",
    generationEpoch: 1,
    counts: { mcq: 2, short: 3, long: 1 },
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

export function applyOfficialAssessmentTemplate(draft: ExamDraft): ExamDraft {
  const spec = getOfficialAssessmentSpec(draft.grade, draft.title);
  draft.assessmentType = assessmentTypeForTitle(draft.title);
  draft.assessmentPolicyId = SCIENCE_ASSESSMENT_POLICY_ID;
  draft.difficulty = "متوسط";
  if (!spec) return draft;
  draft.totalMarks = spec.totalMarks;
  draft.durationMinutes = spec.defaultDurationMinutes;
  draft.counts = { ...spec.counts };
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
  return draft;
}

export function applyOfficialShortTestTemplate(draft: ExamDraft): ExamDraft {
  if (draft.title === "الاختبار النهائي") draft.title = "الاختبار القصير الأول";
  return applyOfficialAssessmentTemplate(draft);
}

export function setExamTitle(draft: ExamDraft, title: ExamTitleOption): ExamDraft {
  draft.title = title;
  return applyOfficialAssessmentTemplate(draft);
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
  return (
    counts.mcq * MARKS_BY_TYPE.mcq +
    counts.short * MARKS_BY_TYPE.short +
    counts.long * MARKS_BY_TYPE.long
  );
}

function countsEqual(left: QuestionCounts, right: Readonly<QuestionCounts>): boolean {
  return left.mcq === right.mcq && left.short === right.short && left.long === right.long;
}

export function validateExamSetup(draft: ExamDraft): SpecValidation {
  const issues: SpecValidation["issues"] = [];
  const officialSpec = getOfficialAssessmentSpec(draft.grade, draft.title);
  const computedMarks = officialSpec ? blueprintMarks(officialSpec.blueprint) : computeMarks(draft.counts);

  if (draft.grade === null) issues.push({ field: "grade", message: "اختر الصف الدراسي." });
  if (!draft.subjectId) issues.push({ field: "subject", message: "اختر المادة." });
  const lessonTopics = normalizeLessonTopics(draft.lessonTopics);
  const uniqueLessons = uniqueLessonTopics(draft.lessonTopics);
  if (lessonTopics.length < MIN_LESSON_TOPICS || lessonTopics.length > MAX_LESSON_TOPICS) {
    issues.push({ field: "lessons", message: `أدخل من ${MIN_LESSON_TOPICS} إلى ${MAX_LESSON_TOPICS} دروس داخلة في الاختبار.` });
  } else if (uniqueLessons.length !== lessonTopics.length) {
    issues.push({ field: "lessons", message: "لا تكرر الدرس نفسه داخل الاختبار." });
  }
  if (!draft.topic.trim()) issues.push({ field: "topic", message: "أدخل الدروس الداخلة في الاختبار." });
  if (draft.sourceReferences.length === 0) issues.push({ field: "sources", message: "لم يرتبط الاختبار بأي صفحة من المصادر المفهرسة." });
  for (const lesson of uniqueLessons) {
    if (!draft.sourceReferences.some((reference) => lessonTopicKey(reference.lessonTopic ?? "") === lessonTopicKey(lesson))) {
      issues.push({ field: "sources", message: `لم يرتبط درس «${lesson}» بأي صفحة من المصدر.` });
    }
  }
  if (!isExamTitleOption(draft.title)) issues.push({ field: "title", message: "اختر عنوان الاختبار من القائمة المعتمدة." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.examDate)) issues.push({ field: "date", message: "اختر تاريخ الاختبار." });
  if (draft.durationMinutes < 10) issues.push({ field: "duration", message: "الزمن يجب ألا يقل عن 10 دقائق." });

  const totalQuestions = draft.counts.mcq + draft.counts.short + draft.counts.long;
  if (totalQuestions === 0) issues.push({ field: "counts", message: "أضف سؤالًا واحدًا على الأقل." });

  if (officialSpec) {
    if (draft.assessmentPolicyId !== SCIENCE_ASSESSMENT_POLICY_ID) {
      issues.push({ field: "policy", message: "المسودة لا تستخدم مرجع تقويم العلوم المعتمد." });
    }
    if (draft.totalMarks !== officialSpec.totalMarks) {
      issues.push({ field: "marks", message: `${draft.title} للصف ${draft.grade} درجته ${officialSpec.totalMarks}.` });
    }
    if (totalQuestions < officialSpec.minItems || totalQuestions > officialSpec.maxItems) {
      issues.push({ field: "counts", message: `عدد المفردات الرسمي للصف ${draft.grade} من ${officialSpec.minItems} إلى ${officialSpec.maxItems}.` });
    }
    if (!countsEqual(draft.counts, officialSpec.counts)) {
      issues.push({ field: "counts", message: "أنواع المفردات لا تطابق القالب الرسمي المعتمد لهذا الصف." });
    }
  } else {
    if (draft.totalMarks < 5) issues.push({ field: "marks", message: "الدرجة الكلية يجب ألا تقل عن 5 درجات." });
    if (totalQuestions > 15) {
      issues.push({ field: "counts", message: "يدعم التوليد حتى 15 مفردة في العملية الواحدة." });
    }
    if (computedMarks !== draft.totalMarks) {
      issues.push({
        field: "counts",
        message: `مجموع درجات الأنواع المختارة هو ${computedMarks}، بينما الدرجة الكلية ${draft.totalMarks}.`,
      });
    }
  }

  const result: SpecValidation = {
    valid: issues.length === 0,
    issues,
    computedMarks,
  };
  if (officialSpec && !countsEqual(draft.counts, officialSpec.counts)) {
    result.suggestedCounts = { ...officialSpec.counts };
  } else if (!officialSpec && computedMarks !== draft.totalMarks) {
    result.suggestedCounts = suggestCountsForMarks(draft.totalMarks, draft.difficulty);
  }
  return result;
}

export function suggestCountsForMarks(totalMarks: number, difficulty: Difficulty): QuestionCounts {
  const longTarget = difficulty === "متقدم" ? Math.max(1, Math.floor(totalMarks / 10)) : Math.floor(totalMarks / 12);
  const longMarks = longTarget * MARKS_BY_TYPE.long;
  const remainingAfterLong = Math.max(0, totalMarks - longMarks);
  const shortTarget = Math.floor(remainingAfterLong / 4);
  const shortMarks = shortTarget * MARKS_BY_TYPE.short;
  const mcqTarget = Math.max(0, totalMarks - longMarks - shortMarks);

  return { mcq: mcqTarget, short: shortTarget, long: longTarget };
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

function outcomeLabel(level: CognitiveLevel, topic: string): string {
  if (level === "معرفة") return `يتذكر ويفهم المفاهيم الأساسية في ${topic}`;
  if (level === "تطبيق") return `يطبق معارفه ومهاراته في ${topic}`;
  return `يستدل ويبرر اعتمادًا على الأدلة في ${topic}`;
}

export function buildPlan(draft: ExamDraft): PlanItem[] {
  const lessons = uniqueLessonTopics(draft.lessonTopics);
  if (lessons.length < MIN_LESSON_TOPICS || lessons.length > MAX_LESSON_TOPICS) {
    throw new Error(`تعذر بناء الخطة: يجب إدخال ${MIN_LESSON_TOPICS}-${MAX_LESSON_TOPICS} دروس مختلفة.`);
  }
  syncDraftTopicFromLessons(draft);
  if (!draft.sourceReferences.length) throw new Error("تعذر بناء الخطة دون مقاطع مصدر مرتبطة.");
  const officialSpec = getOfficialAssessmentSpec(draft.grade, draft.title);
  const entries = officialSpec
    ? officialSpec.blueprint.map((item) => ({
      type: item.questionType,
      marks: item.marks,
      level: item.cognitiveLevel,
      difficultyLevel: item.difficultyLevel,
    }))
    : questionEntries(draft.counts).map((item, index) => ({
      ...item,
      level: cognitiveCycle(draft.difficulty)[index % cognitiveCycle(draft.difficulty).length] ?? "معرفة",
      difficultyLevel: undefined,
    }));

  const referencesByLesson = new Map<string, ExamDraft["sourceReferences"]>();
  for (const lesson of lessons) referencesByLesson.set(lessonTopicKey(lesson), []);
  for (const reference of draft.sourceReferences) {
    const key = lessonTopicKey(reference.lessonTopic ?? "");
    const bucket = referencesByLesson.get(key);
    if (bucket) bucket.push(reference);
  }
  for (const lesson of lessons) {
    if (!(referencesByLesson.get(lessonTopicKey(lesson))?.length)) {
      throw new Error(`تعذر بناء الخطة لأن درس «${lesson}» غير مرتبط بمصدر مفهرس.`);
    }
  }

  const referenceOffsets = new Map<string, number>();
  return entries.map((entry, index) => {
    const lessonIndex = index % lessons.length;
    const lesson = lessons[lessonIndex];
    if (!lesson) throw new Error("تعذر توزيع مفردات الخطة على الدروس.");
    const key = lessonTopicKey(lesson);
    const lessonReferences = referencesByLesson.get(key) ?? [];
    const offset = referenceOffsets.get(key) ?? 0;
    const reference = lessonReferences[offset % lessonReferences.length];
    if (!reference) throw new Error(`تعذر ربط درس «${lesson}» بمقطع مصدر.`);
    referenceOffsets.set(key, offset + 1);
    return {
      id: `plan-${index + 1}`,
      lessonId: `lesson-${lessonIndex + 1}`,
      lessonLabel: lesson,
      outcomeId: `lesson-${lessonIndex + 1}-outcome-${index + 1}`,
      outcomeLabel: outcomeLabel(entry.level, lesson),
      cognitiveLevel: entry.level,
      ...(entry.difficultyLevel ? { difficultyLevel: entry.difficultyLevel } : {}),
      questionType: entry.type,
      marks: entry.marks,
      sourceReferenceId: reference.id,
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

export function officialPlanCounts(draft: ExamDraft): QuestionCounts | null {
  const spec = getOfficialAssessmentSpec(draft.grade, draft.title);
  return spec ? blueprintCounts(spec.blueprint) : null;
}
