import { SUBJECTS } from "./data.js";
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
    grade: null,
    subjectId: "",
    unitId: "",
    lessonIds: [],
    outcomeIds: [],
    title: "",
    examDate: "",
    school: "مدرسة الباسط للتعليم الأساسي",
    directorate: "محافظة جنوب الباطنة",
    academicYear: context.academicYear,
    semester: context.semester,
    durationMinutes: 40,
    totalMarks: 20,
    difficulty: "متوسط",
    counts: { mcq: 4, short: 4, long: 2 },
    plan: [],
    selectedProposalByPlanItem: {},
    currentStep: 1,
    updatedAt: now.toISOString(),
    status: "مسودة",
  };
}

export function computeMarks(counts: QuestionCounts): number {
  return (
    counts.mcq * MARKS_BY_TYPE.mcq +
    counts.short * MARKS_BY_TYPE.short +
    counts.long * MARKS_BY_TYPE.long
  );
}

export function validateExamSetup(draft: ExamDraft): SpecValidation {
  const issues: SpecValidation["issues"] = [];
  const computedMarks = computeMarks(draft.counts);

  if (draft.grade === null) issues.push({ field: "grade", message: "اختر الصف الدراسي." });
  if (!draft.subjectId) issues.push({ field: "subject", message: "اختر المادة." });
  if (!draft.unitId) issues.push({ field: "unit", message: "اختر الوحدة." });
  if (draft.lessonIds.length === 0) issues.push({ field: "lessons", message: "اختر درسًا واحدًا على الأقل." });
  if (draft.outcomeIds.length === 0) issues.push({ field: "outcomes", message: "اختر ناتج تعلم واحدًا على الأقل." });
  if (!draft.title.trim()) issues.push({ field: "title", message: "أدخل عنوان الاختبار." });
  if (!draft.examDate) issues.push({ field: "date", message: "اختر تاريخ الاختبار." });
  if (draft.durationMinutes < 10) issues.push({ field: "duration", message: "الزمن يجب ألا يقل عن 10 دقائق." });
  if (draft.totalMarks < 5) issues.push({ field: "marks", message: "الدرجة الكلية يجب ألا تقل عن 5 درجات." });

  const totalQuestions = draft.counts.mcq + draft.counts.short + draft.counts.long;
  if (totalQuestions === 0) {
    issues.push({ field: "counts", message: "أضف سؤالًا واحدًا على الأقل." });
  }

  if (computedMarks !== draft.totalMarks) {
    issues.push({
      field: "counts",
      message: `مجموع درجات الأنواع المختارة هو ${computedMarks}، بينما الدرجة الكلية ${draft.totalMarks}.`,
    });
  }

  if (draft.difficulty === "متقدم" && draft.counts.long === 0) {
    issues.push({
      field: "counts",
      message: "المستوى المتقدم يحتاج سؤال إجابة طويلة واحدًا على الأقل لقياس الاستدلال.",
    });
  }

  const result: SpecValidation = {
    valid: issues.length === 0,
    issues,
    computedMarks,
  };
  if (computedMarks !== draft.totalMarks) {
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

export function buildPlan(draft: ExamDraft): PlanItem[] {
  const subject = SUBJECTS.find((item) => item.id === draft.subjectId);
  const unit = subject?.units.find((item) => item.id === draft.unitId);
  const lessons = unit?.lessons.filter((lesson) => draft.lessonIds.includes(lesson.id)) ?? [];
  const availableOutcomes = lessons.flatMap((lesson) =>
    lesson.outcomes
      .filter((outcome) => draft.outcomeIds.includes(outcome.id))
      .map((outcome) => ({ lesson, outcome })),
  );

  if (availableOutcomes.length === 0) return [];

  const levels = cognitiveCycle(draft.difficulty);
  return questionEntries(draft.counts).map((entry, index) => {
    const mapped = availableOutcomes[index % availableOutcomes.length];
    if (!mapped) throw new Error("تعذر ربط مفردة الخطة بناتج تعلم.");
    const cognitiveLevel = levels[index % levels.length] ?? "معرفة";
    const itemId = `plan-${index + 1}`;
    return {
      id: itemId,
      lessonId: mapped.lesson.id,
      lessonLabel: mapped.lesson.label,
      outcomeId: mapped.outcome.id,
      outcomeLabel: mapped.outcome.label,
      cognitiveLevel,
      questionType: entry.type,
      marks: entry.marks,
      proposals: generateProposals(itemId, entry.type, cognitiveLevel, mapped.outcome.label, index),
    };
  });
}

export function generateProposals(
  planItemId: string,
  type: QuestionType,
  level: CognitiveLevel,
  outcomeLabel: string,
  seed: number,
): QuestionProposal[] {
  const contexts = ["مختبر المدرسة", "موقف حياتي", "بيانات تجربة علمية"];
  return contexts.map((context, index) => {
    const suffix = `${seed + 1}-${index + 1}`;
    const base = proposalText(type, level, context, outcomeLabel, index);
    const proposal: QuestionProposal = {
      id: `${planItemId}-proposal-${index + 1}`,
      text: base,
      answer: proposalAnswer(type, level, index),
    };
    if (type === "اختيار من متعدد") {
      proposal.rationale = "لأن الاختيار يطابق العلاقة العلمية الواردة في المعطيات.";
    }
    if (index === 2) proposal.visualKind = "رسم بياني";
    if (index === 1) proposal.visualKind = "جدول";
    return proposal;
  });
}

function proposalText(
  type: QuestionType,
  level: CognitiveLevel,
  context: string,
  outcomeLabel: string,
  variant: number,
): string {
  const compactOutcome = outcomeLabel.replace(/\.$/, "");
  if (type === "اختيار من متعدد") {
    return `في ${context}، أي الخيارات الآتية يوضح بصورة أدق كيف ${compactOutcome}؟ [صياغة ${variant + 1}]`;
  }
  if (type === "إجابة قصيرة") {
    return `${level === "استدلال" ? "استدل" : "اذكر"} من ${context} إجابة قصيرة توضح كيف ${compactOutcome}. [صياغة ${variant + 1}]`;
  }
  return `حلّل معطيات ${context}، ثم فسّر بتسلسل علمي كيف ${compactOutcome}، وادعم إجابتك بدليل مناسب. [صياغة ${variant + 1}]`;
}

function proposalAnswer(type: QuestionType, level: CognitiveLevel, variant: number): string {
  if (type === "اختيار من متعدد") return `الخيار الصحيح: (${String.fromCharCode(65 + variant)})`;
  if (type === "إجابة قصيرة") return `إجابة نموذجية قصيرة متوافقة مع مستوى ${level}.`;
  return "توزع الدرجات على الفكرة العلمية، والتفسير، والدليل، ودقة المصطلحات.";
}

export function isPlanComplete(draft: ExamDraft): boolean {
  return draft.plan.length > 0 && draft.plan.every((item) => Boolean(draft.selectedProposalByPlanItem[item.id]));
}

export function selectedProposal(draft: ExamDraft, item: PlanItem): QuestionProposal | undefined {
  const proposalId = draft.selectedProposalByPlanItem[item.id];
  return item.proposals.find((proposal) => proposal.id === proposalId);
}
