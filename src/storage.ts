import type {
  CambridgeProgrammeId,
  ExamDraft,
  ExamTitleOption,
  PlanItem,
  QuestionProposal,
  QuestionVisualJobSnapshot,
  VisualJobStatus,
} from "./types.js";
import { createEmptyDraft, toDateInputValue } from "./domain.js";
import { CAMBRIDGE_ASSESSMENT_POLICY_ID, assessmentSpecification, assessmentTypeForTitle, isExamTitleOption } from "./cambridge-assessment.js";
import { defaultStageForProgramme, isStageValidForProgramme, subjectProfile, syllabusCodeFor } from "./cambridge-curriculum.js";
import { ASSESSMENT_PROGRESSIVE_GENERATION_VERSION } from "./assessment-generation-progressive.js";
import { diversifyQuestionVisualSpec } from "./question-visual.js";

const DRAFTS_KEY = "wathiq.examDrafts";
const ACTIVE_DRAFT_ID_KEY = "wathiq.activeDraftId";
const PROFILE_KEY = "wathiq.profile";
const MAX_STORED_DRAFTS = 12;

export interface SavedProfile { school: string; }

function currentProgramme(value: unknown): CambridgeProgrammeId {
  return value === "primary" || value === "lower_secondary" || value === "igcse" ? value : "primary";
}

function normalizeVisualJobs(value: unknown): Record<string, QuestionVisualJobSnapshot> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const allowed = new Set<VisualJobStatus>(["queued", "generating", "validating", "ready", "retry_pending", "failed", "cancelled"]);
  const result: Record<string, QuestionVisualJobSnapshot> = {};
  for (const [planItemId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
    const item = raw as Partial<QuestionVisualJobSnapshot>;
    if (typeof item.id !== "string" || typeof item.draftId !== "string" || typeof item.planItemId !== "string"
      || typeof item.visualHash !== "string" || typeof item.status !== "string" || !allowed.has(item.status as VisualJobStatus)
      || typeof item.attemptCount !== "number" || typeof item.maxAttempts !== "number" || typeof item.updatedAt !== "string") continue;
    result[planItemId] = {
      id: item.id,
      draftId: item.draftId,
      planItemId: item.planItemId,
      visualHash: item.visualHash,
      requiredMode: "replace",
      status: item.status as VisualJobStatus,
      attemptCount: item.attemptCount,
      maxAttempts: item.maxAttempts,
      errorCode: typeof item.errorCode === "string" ? item.errorCode : "",
      errorMessage: typeof item.errorMessage === "string" ? item.errorMessage : "",
      ...(item.asset ? { asset: item.asset } : {}),
      startedAt: typeof item.startedAt === "string" ? item.startedAt : "",
      completedAt: typeof item.completedAt === "string" ? item.completedAt : "",
      updatedAt: item.updatedAt,
    };
  }
  return result;
}

function normalizeProposal(value: unknown): QuestionProposal | null {
  if (typeof value !== "object" || value === null) return null;
  const item = value as Partial<QuestionProposal>;
  if (typeof item.id !== "string" || typeof item.text !== "string" || typeof item.answer !== "string") return null;
  return {
    id: item.id,
    ...(typeof item.stimulus === "string" && item.stimulus.trim() ? { stimulus: item.stimulus } : {}),
    text: item.text,
    ...(Array.isArray(item.options) ? { options: item.options.filter((option): option is string => typeof option === "string") } : {}),
    answer: item.answer,
    ...(typeof item.rationale === "string" && item.rationale.trim() ? { rationale: item.rationale } : {}),
    ...(Array.isArray(item.markScheme) ? { markScheme: item.markScheme.filter((step): step is string => typeof step === "string") } : {}),
    ...(typeof item.workingRequired === "boolean" ? { workingRequired: item.workingRequired } : {}),
    ...(typeof item.reviewSupport === "string" && item.reviewSupport.trim() ? { reviewSupport: item.reviewSupport } : {}),
  };
}

function normalizeStoredPlan(value: unknown): PlanItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (typeof entry !== "object" || entry === null) return [];
    const item = entry as Partial<PlanItem>;
    if (typeof item.id !== "string" || typeof item.lessonId !== "string" || typeof item.lessonLabel !== "string"
      || typeof item.questionType !== "string" || typeof item.cognitiveLevel !== "string" || typeof item.marks !== "number"
      || !Array.isArray(item.proposals)) return [];
    const proposals = item.proposals.map(normalizeProposal).filter((proposal): proposal is QuestionProposal => Boolean(proposal));
    const normalized: PlanItem = {
      id: item.id,
      lessonId: item.lessonId,
      lessonLabel: item.lessonLabel,
      cognitiveLevel: item.cognitiveLevel,
      ...(item.difficultyLevel ? { difficultyLevel: item.difficultyLevel } : {}),
      ...(item.assessmentFocus === "استقصاء علمي" ? { assessmentFocus: "استقصاء علمي" as const } : {}),
      questionType: item.questionType,
      marks: item.marks,
      proposals,
    };
    if (item.visual && typeof item.visual === "object") {
      try { normalized.visual = diversifyQuestionVisualSpec(item.visual, index, item.id); } catch { /* المرئي غير الصالح لا يُحمّل. */ }
    }
    return [normalized];
  });
}

export function normalizeExamDraft(value: unknown): ExamDraft | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<ExamDraft>;
  const base = createEmptyDraft();
  const programmeId = currentProgramme(candidate.programmeId);
  const requestedGrade = typeof candidate.grade === "number" ? candidate.grade : defaultStageForProgramme(programmeId);
  const grade = isStageValidForProgramme(programmeId, requestedGrade) ? requestedGrade : defaultStageForProgramme(programmeId);
  const requestedSubject = typeof candidate.subjectId === "string" ? candidate.subjectId.trim() : "";
  const subjectId = subjectProfile(programmeId, requestedSubject)
    ? requestedSubject
    : programmeId === "igcse" ? "" : "science";
  const title: ExamTitleOption = typeof candidate.title === "string" && isExamTitleOption(candidate.title) ? candidate.title : "الاختبار القصير الأول";
  const lessons = Array.isArray(candidate.lessonTopics)
    ? candidate.lessonTopics.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()).slice(0, 5)
    : [];
  const spec = assessmentSpecification(grade, title);
  const plan = normalizeStoredPlan(candidate.plan);
  const draft: ExamDraft = {
    id: typeof candidate.id === "string" && candidate.id ? candidate.id : base.id,
    assessmentType: assessmentTypeForTitle(title),
    assessmentPolicyId: CAMBRIDGE_ASSESSMENT_POLICY_ID,
    programmeId,
    syllabusCode: subjectId ? syllabusCodeFor(programmeId, subjectId) : "",
    grade,
    subjectId,
    lessonTopics: lessons,
    topic: typeof candidate.topic === "string" && candidate.topic.trim() ? candidate.topic.trim() : lessons.join("، "),
    title,
    examDate: typeof candidate.examDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(candidate.examDate) ? candidate.examDate : toDateInputValue(),
    school: typeof candidate.school === "string" ? candidate.school : "",
    academicYear: typeof candidate.academicYear === "string" && candidate.academicYear ? candidate.academicYear : base.academicYear,
    durationMinutes: spec.durationMinutes,
    totalMarks: spec.totalMarks,
    difficulty: candidate.difficulty === "سهل" || candidate.difficulty === "متوسط" || candidate.difficulty === "متقدم" ? candidate.difficulty : base.difficulty,
    visualJobs: normalizeVisualJobs(candidate.visualJobs),
    generationMode: "progressive_items_v1",
    generationRunId: typeof candidate.generationRunId === "string" ? candidate.generationRunId : "",
    generationEpoch: typeof candidate.generationEpoch === "number" && Number.isSafeInteger(candidate.generationEpoch) && candidate.generationEpoch >= 1 ? candidate.generationEpoch : 1,
    counts: { ...spec.counts },
    plan,
    selectedProposalByPlanItem: typeof candidate.selectedProposalByPlanItem === "object" && candidate.selectedProposalByPlanItem !== null
      ? candidate.selectedProposalByPlanItem as Record<string, string> : {},
    generationVersion: typeof candidate.generationVersion === "string" ? candidate.generationVersion : "",
    generationModel: typeof candidate.generationModel === "string" ? candidate.generationModel : "",
    generatedAt: typeof candidate.generatedAt === "string" ? candidate.generatedAt : "",
    approvedAt: typeof candidate.approvedAt === "string" ? candidate.approvedAt : "",
    currentStep: Math.max(1, Math.min(4, Number(candidate.currentStep) || 1)) as ExamDraft["currentStep"],
    updatedAt: typeof candidate.updatedAt === "string" && candidate.updatedAt ? candidate.updatedAt : base.updatedAt,
    status: candidate.status === "معتمد" || candidate.status === "جاهز للمراجعة" ? candidate.status : "مسودة",
  };


  const planMarks = draft.plan.reduce((sum, item) => sum + item.marks, 0);
  const expectedItemCount = spec.operationalItemCount;
  if (draft.plan.length && (draft.plan.length !== expectedItemCount || planMarks !== spec.totalMarks)) {
    draft.plan = [];
    draft.selectedProposalByPlanItem = {};
    draft.visualJobs = {};
    draft.generationRunId = "";
    draft.generationVersion = "";
    draft.currentStep = 2;
  }

  const hasGeneratedContent = draft.plan.some((item) => item.proposals.some((proposal) => proposal.text.trim()));
  if (hasGeneratedContent) {
    draft.currentStep = Math.max(3, draft.currentStep) as ExamDraft["currentStep"];
  } else if (plan.length && draft.generationVersion !== ASSESSMENT_PROGRESSIVE_GENERATION_VERSION) {
    draft.plan = [];
    draft.selectedProposalByPlanItem = {};
    draft.visualJobs = {};
    draft.generationRunId = "";
    draft.generationVersion = "";
    draft.currentStep = 2;
  }
  return draft;
}

interface StoredDraftCollection { schemaVersion: 2; activeDraftId: string; drafts: ExamDraft[]; }
function draftTimestamp(draft: ExamDraft): number { const value = Date.parse(draft.updatedAt || ""); return Number.isFinite(value) ? value : 0; }
function sortDraftsByRecency(drafts: ExamDraft[]): ExamDraft[] { return [...drafts].sort((a, b) => draftTimestamp(b) - draftTimestamp(a)); }

function readDraftCollection(): StoredDraftCollection {
  const raw = localStorage.getItem(DRAFTS_KEY);
  if (!raw) return { schemaVersion: 2, activeDraftId: "", drafts: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<StoredDraftCollection>;
    if (parsed.schemaVersion !== 2 || !Array.isArray(parsed.drafts)) throw new Error("إصدار تخزين غير صالح");
    const drafts = sortDraftsByRecency(parsed.drafts.map(normalizeExamDraft).filter((draft): draft is ExamDraft => Boolean(draft))).slice(0, MAX_STORED_DRAFTS);
    const requested = typeof parsed.activeDraftId === "string" ? parsed.activeDraftId : "";
    return { schemaVersion: 2, activeDraftId: drafts.some((draft) => draft.id === requested) ? requested : drafts[0]?.id ?? "", drafts };
  } catch {
    localStorage.removeItem(DRAFTS_KEY);
    localStorage.removeItem(ACTIVE_DRAFT_ID_KEY);
    return { schemaVersion: 2, activeDraftId: "", drafts: [] };
  }
}

function writeDraftCollection(collection: StoredDraftCollection): void {
  let drafts = sortDraftsByRecency(collection.drafts).slice(0, MAX_STORED_DRAFTS);
  let activeDraftId = drafts.some((draft) => draft.id === collection.activeDraftId) ? collection.activeDraftId : drafts[0]?.id ?? "";
  while (true) {
    try {
      localStorage.setItem(DRAFTS_KEY, JSON.stringify({ schemaVersion: 2, activeDraftId, drafts }));
      if (activeDraftId) localStorage.setItem(ACTIVE_DRAFT_ID_KEY, activeDraftId); else localStorage.removeItem(ACTIVE_DRAFT_ID_KEY);
      break;
    } catch (error) {
      const removableIndex = [...drafts].reverse().findIndex((draft) => draft.id !== activeDraftId);
      if (removableIndex < 0) throw error;
      const index = drafts.length - 1 - removableIndex;
      drafts = drafts.filter((_, itemIndex) => itemIndex !== index);
      activeDraftId = drafts.some((draft) => draft.id === activeDraftId) ? activeDraftId : drafts[0]?.id ?? "";
    }
  }
}

export function saveDraft(draft: ExamDraft): void {
  const collection = readDraftCollection();
  writeDraftCollection({ schemaVersion: 2, activeDraftId: draft.id, drafts: [...collection.drafts.filter((item) => item.id !== draft.id), draft] });
}
export function loadDraft(draftId?: string): ExamDraft | null {
  const collection = readDraftCollection();
  const id = draftId || localStorage.getItem(ACTIVE_DRAFT_ID_KEY) || collection.activeDraftId;
  const draft = collection.drafts.find((item) => item.id === id) ?? collection.drafts[0];
  return draft ? normalizeExamDraft(draft) : null;
}
export function loadDrafts(): ExamDraft[] { return readDraftCollection().drafts.map(normalizeExamDraft).filter((draft): draft is ExamDraft => Boolean(draft)); }
export function setActiveDraftId(draftId: string): void {
  const collection = readDraftCollection();
  if (collection.drafts.some((draft) => draft.id === draftId)) writeDraftCollection({ ...collection, activeDraftId: draftId });
}
export function clearDraft(draftId?: string): void {
  const collection = readDraftCollection();
  const id = draftId || localStorage.getItem(ACTIVE_DRAFT_ID_KEY) || collection.activeDraftId;
  const drafts = collection.drafts.filter((draft) => draft.id !== id);
  writeDraftCollection({ schemaVersion: 2, activeDraftId: drafts[0]?.id ?? "", drafts });
}

export function saveProfile(profile: SavedProfile): void { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); }
export function loadProfile(): SavedProfile | null {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    return { school: typeof value.school === "string" ? value.school : "" };
  } catch {
    localStorage.removeItem(PROFILE_KEY);
    return null;
  }
}
