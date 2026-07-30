import {
  SCIENCE_ASSESSMENT_POLICY_ID,
  blueprintCounts,
  blueprintMarks,
  getOfficialShortTestSpec,
} from "./assessment-policy.js";
import type {
  CognitiveLevel,
  Difficulty,
  ExamDraft,
  PlanItem,
  QuestionCounts,
  QuestionProposal,
  QuestionType,
  SpecValidation,
} from "./types.js";

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
    topic: "",
    sourceReferences: [],
    title: "",
    examDate: "",
    school: "مدرسة الباسط للتعليم الأساسي",
    directorate: "محافظة جنوب الباطنة",
    academicYear: context.academicYear,
    semester: context.semester,
    durationMinutes: 40,
    totalMarks: 10,
    difficulty: "متوسط",
    counts: { mcq: 2, short: 3, long: 1 },
    plan: [],
    selectedProposalByPlanItem: {},
    generationVersion: "",
    generationModel: "",
    generatedAt: "",
    currentStep: 1,
    updatedAt: now.toISOString(),
    status: "مسودة",
  };
}

export function applyOfficialShortTestTemplate(draft: ExamDraft): ExamDraft {
  const spec = getOfficialShortTestSpec(draft.grade);
  draft.assessmentType = "اختبار قصير رسمي";
  draft.assessmentPolicyId = SCIENCE_ASSESSMENT_POLICY_ID;
  draft.difficulty = "متوسط";
  if (!spec) return draft;
  draft.totalMarks = spec.totalMarks;
  draft.durationMinutes = spec.defaultDurationMinutes;
  draft.counts = { ...spec.counts };
  draft.plan = [];
  draft.selectedProposalByPlanItem = {};
  draft.generationVersion = "";
  draft.generationModel = "";
  draft.generatedAt = "";
  return draft;
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
  const officialSpec = getOfficialShortTestSpec(draft.grade);
  const computedMarks = officialSpec ? blueprintMarks(officialSpec.blueprint) : computeMarks(draft.counts);

  if (draft.grade === null) issues.push({ field: "grade", message: "اختر الصف الدراسي." });
  if (!draft.subjectId) issues.push({ field: "subject", message: "اختر المادة." });
  if (!draft.topic.trim()) issues.push({ field: "topic", message: "اكتب موضوع الاختبار أو اسم الدرس." });
  if (draft.sourceReferences.length === 0) issues.push({ field: "sources", message: "لم يرتبط الاختبار بأي صفحة من المصادر المفهرسة." });
  if (!draft.title.trim()) issues.push({ field: "title", message: "أدخل عنوان الاختبار." });
  if (!draft.examDate) issues.push({ field: "date", message: "اختر تاريخ الاختبار." });
  if (draft.durationMinutes < 10) issues.push({ field: "duration", message: "الزمن يجب ألا يقل عن 10 دقائق." });

  const totalQuestions = draft.counts.mcq + draft.counts.short + draft.counts.long;
  if (totalQuestions === 0) issues.push({ field: "counts", message: "أضف سؤالًا واحدًا على الأقل." });

  if (officialSpec) {
    if (draft.assessmentPolicyId !== SCIENCE_ASSESSMENT_POLICY_ID) {
      issues.push({ field: "policy", message: "المسودة لا تستخدم مرجع تقويم العلوم المعتمد." });
    }
    if (draft.totalMarks !== officialSpec.totalMarks) {
      issues.push({ field: "marks", message: `الاختبار القصير الرسمي للصف ${draft.grade} درجته ${officialSpec.totalMarks}.` });
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
  const topic = draft.topic.trim();
  if (!topic) throw new Error("تعذر بناء الخطة دون موضوع واضح.");
  if (!draft.sourceReferences.length) throw new Error("تعذر بناء الخطة دون مقاطع مصدر مرتبطة.");
  const officialSpec = getOfficialShortTestSpec(draft.grade);
  const entries = officialSpec
    ? officialSpec.blueprint.map((item) => ({ type: item.questionType, marks: item.marks, level: item.cognitiveLevel }))
    : questionEntries(draft.counts).map((item, index) => ({
      ...item,
      level: cognitiveCycle(draft.difficulty)[index % cognitiveCycle(draft.difficulty).length] ?? "معرفة",
    }));

  return entries.map((entry, index) => {
    const reference = draft.sourceReferences[index % draft.sourceReferences.length];
    if (!reference) throw new Error("تعذر ربط مفردة الخطة بمصدر مفهرس.");
    return {
      id: `plan-${index + 1}`,
      lessonId: `topic-${index + 1}`,
      lessonLabel: topic,
      outcomeId: `topic-outcome-${index + 1}`,
      outcomeLabel: outcomeLabel(entry.level, topic),
      cognitiveLevel: entry.level,
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
  const spec = getOfficialShortTestSpec(draft.grade);
  return spec ? blueprintCounts(spec.blueprint) : null;
}
