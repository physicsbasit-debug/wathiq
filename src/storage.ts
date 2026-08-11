import type {
  CambridgeProgrammeId,
  ExamDraft,
  ExamSourceReference,
  ExamTitleOption,
  ManagedSource,
  PlanItem,
  QuestionVisualJobSnapshot,
  VisualJobStatus,
} from "./types.js";
import { createEmptyDraft, toDateInputValue } from "./domain.js";
import { CAMBRIDGE_ASSESSMENT_POLICY_ID, assessmentTypeForTitle, isExamTitleOption } from "./cambridge-assessment.js";
import { syllabusCodeFor } from "./cambridge-curriculum.js";
import { normalizeManagedSource } from "./source-registry.js";
import { ASSESSMENT_PROGRESSIVE_GENERATION_VERSION } from "./assessment-generation-progressive.js";
import { diversifyQuestionVisualSpec } from "./question-visual.js";

const DRAFT_KEY = "wathiq.phase0b.latestDraft";
const DRAFTS_KEY = "wathiq.examDrafts.v1";
const ACTIVE_DRAFT_ID_KEY = "wathiq.activeDraftId.v1";
const MAX_STORED_DRAFTS = 12;
const PROFILE_KEY = "wathiq.phase0b.profile";
const SOURCES_KEY = "wathiq.phase0d.sourceRegistry";
const LEGACY_SOURCES_KEY = "wathiq.phase0c.sources";

export interface SavedProfile { school: string; }

function inferProgramme(candidate: Partial<ExamDraft>): CambridgeProgrammeId {
  if (candidate.programmeId === "primary" || candidate.programmeId === "lower_secondary" || candidate.programmeId === "igcse") return candidate.programmeId;
  const grade = typeof candidate.grade === "number" ? candidate.grade : 1;
  const subject = typeof candidate.subjectId === "string" ? candidate.subjectId : "";
  if (grade <= 6) return "primary";
  if (grade <= 9 && (!subject || subject === "science")) return "lower_secondary";
  return "igcse";
}

function normalizeSourceReferences(value: unknown): ExamSourceReference[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const item = entry as Partial<ExamSourceReference>;
    if (typeof item.id !== "string" || typeof item.sourceId !== "string" || typeof item.sourceTitle !== "string"
      || typeof item.sourceKind !== "string" || typeof item.pageFrom !== "number" || typeof item.pageTo !== "number"
      || typeof item.excerpt !== "string" || typeof item.score !== "number") return [];
    return [{
      id: item.id,
      sourceId: item.sourceId,
      sourceTitle: item.sourceTitle,
      sourceKind: item.sourceKind,
      pageFrom: item.pageFrom,
      pageTo: item.pageTo,
      excerpt: item.excerpt,
      score: item.score,
      ...(typeof item.context === "string" && item.context.trim() ? { context: item.context } : {}),
      ...(typeof item.lessonTopic === "string" && item.lessonTopic.trim() ? { lessonTopic: item.lessonTopic.trim() } : {}),
    }];
  });
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
      id: item.id, draftId: item.draftId, planItemId: item.planItemId, visualHash: item.visualHash,
      requiredMode: "replace", status: item.status as VisualJobStatus, attemptCount: item.attemptCount, maxAttempts: item.maxAttempts,
      errorCode: typeof item.errorCode === "string" ? item.errorCode : "", errorMessage: typeof item.errorMessage === "string" ? item.errorMessage : "",
      ...(item.asset ? { asset: item.asset } : {}), startedAt: typeof item.startedAt === "string" ? item.startedAt : "",
      completedAt: typeof item.completedAt === "string" ? item.completedAt : "", updatedAt: item.updatedAt,
    };
  }
  return result;
}

function normalizeStoredPlan(value: unknown): PlanItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (typeof entry !== "object" || entry === null) return [];
    const item = entry as PlanItem;
    if (typeof item.id !== "string" || !Array.isArray(item.proposals) || typeof item.lessonId !== "string"
      || typeof item.lessonLabel !== "string" || typeof item.questionType !== "string"
      || typeof item.cognitiveLevel !== "string" || typeof item.marks !== "number") return [];
    const proposals = item.proposals.map((proposal) => {
      const record = proposal as typeof proposal & { scientificItem?: unknown; needsReview?: unknown };
      const { scientificItem: _scientific, needsReview: _review, ...clean } = record;
      return clean;
    });
    const legacy = item as PlanItem & { outcomeId?: unknown; outcomeLabel?: unknown };
    const { outcomeId: _outcomeId, outcomeLabel: _outcomeLabel, ...cleanItem } = legacy;
    if (!item.visual || typeof item.visual !== "object") return [{ ...cleanItem, proposals }];
    try { return [{ ...cleanItem, proposals, visual: diversifyQuestionVisualSpec(item.visual, index, item.id) }]; }
    catch { const { visual: _visual, ...withoutVisual } = cleanItem; return [{ ...withoutVisual, proposals }]; }
  });
}

export function normalizeExamDraft(value: unknown): ExamDraft | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<ExamDraft>;
  const base = createEmptyDraft();
  const programmeId = inferProgramme(candidate);
  const legacyGrade = typeof candidate.grade === "number" ? candidate.grade : base.grade;
  const grade = programmeId === "igcse" ? null : legacyGrade;
  const subjectId = typeof candidate.subjectId === "string" && candidate.subjectId.trim()
    ? candidate.subjectId.trim()
    : programmeId === "igcse" ? "" : "science";
  const title: ExamTitleOption = typeof candidate.title === "string" && isExamTitleOption(candidate.title) ? candidate.title : "اختبار قصير";
  const lessons = Array.isArray(candidate.lessonTopics)
    ? candidate.lessonTopics.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, 5)
    : typeof candidate.topic === "string" && candidate.topic.trim() ? [candidate.topic.trim()] : [];

  const draft: ExamDraft = {
    ...base,
    ...candidate,
    assessmentType: assessmentTypeForTitle(title),
    assessmentPolicyId: CAMBRIDGE_ASSESSMENT_POLICY_ID,
    programmeId,
    syllabusCode: subjectId ? syllabusCodeFor(programmeId, subjectId) : "",
    grade,
    subjectId,
    lessonTopics: lessons,
    topic: typeof candidate.topic === "string" ? candidate.topic : lessons.join("، "),
    sourceReferences: normalizeSourceReferences(candidate.sourceReferences),
    sourceRetrievalVersion: typeof candidate.sourceRetrievalVersion === "string" ? candidate.sourceRetrievalVersion : "",
    title,
    visualJobs: normalizeVisualJobs(candidate.visualJobs),
    generationMode: "progressive_items_v1",
    generationRunId: typeof candidate.generationRunId === "string" ? candidate.generationRunId : "",
    generationEpoch: typeof candidate.generationEpoch === "number" && Number.isSafeInteger(candidate.generationEpoch) && candidate.generationEpoch >= 1 ? candidate.generationEpoch : 1,
    examDate: typeof candidate.examDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(candidate.examDate) ? candidate.examDate : toDateInputValue(),
    counts: {
      mcq: typeof candidate.counts?.mcq === "number" ? candidate.counts.mcq : base.counts.mcq,
      short: typeof candidate.counts?.short === "number" ? candidate.counts.short : base.counts.short,
      long: typeof candidate.counts?.long === "number" ? candidate.counts.long : base.counts.long,
    },
    plan: normalizeStoredPlan(candidate.plan),
    selectedProposalByPlanItem: typeof candidate.selectedProposalByPlanItem === "object" && candidate.selectedProposalByPlanItem !== null
      ? candidate.selectedProposalByPlanItem as Record<string, string> : {},
    generationVersion: typeof candidate.generationVersion === "string" ? candidate.generationVersion : "",
    generationModel: typeof candidate.generationModel === "string" ? candidate.generationModel : "",
    generatedAt: typeof candidate.generatedAt === "string" ? candidate.generatedAt : "",
    approvedAt: typeof candidate.approvedAt === "string" ? candidate.approvedAt : "",
    status: candidate.status === "معتمد" || candidate.status === "جاهز للمراجعة" ? candidate.status : "مسودة",
  };
  // Legacy local-school metadata is intentionally not part of the current Cambridge draft contract.
  delete (draft as unknown as Record<string, unknown>).directorate;
  delete (draft as unknown as Record<string, unknown>).semester;

  // لا نحذف عمل المستخدم المكتمل. أما خطة قديمة غير مكتملة فتعاد إلى الإعداد بدل حمل عقود ميتة.
  const hasGeneratedContent = draft.plan.some((item) => item.proposals.some((proposal) => proposal.text?.trim()));
  if (hasGeneratedContent) {
    draft.currentStep = Math.max(3, Math.min(4, Number(candidate.currentStep) || 3)) as ExamDraft["currentStep"];
  } else if (draft.plan.length && draft.generationVersion !== ASSESSMENT_PROGRESSIVE_GENERATION_VERSION) {
    draft.plan = [];
    draft.selectedProposalByPlanItem = {};
    draft.visualJobs = {};
    draft.generationRunId = "";
    draft.generationVersion = "";
    draft.currentStep = 2;
  } else {
    const step = Number(candidate.currentStep) || 1;
    draft.currentStep = Math.max(1, Math.min(4, step)) as ExamDraft["currentStep"];
  }
  return draft;
}

interface StoredDraftCollection { schemaVersion: 1; activeDraftId: string; drafts: ExamDraft[]; }
function draftTimestamp(draft: ExamDraft): number { const value = Date.parse(draft.updatedAt || ""); return Number.isFinite(value) ? value : 0; }
function sortDraftsByRecency(drafts: ExamDraft[]): ExamDraft[] { return [...drafts].sort((a, b) => draftTimestamp(b) - draftTimestamp(a)); }

function readLegacyDraft(): ExamDraft | null {
  const raw = localStorage.getItem(DRAFT_KEY); if (!raw) return null;
  try { return normalizeExamDraft(JSON.parse(raw)); } catch { localStorage.removeItem(DRAFT_KEY); return null; }
}

function readDraftCollection(): StoredDraftCollection {
  const raw = localStorage.getItem(DRAFTS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<StoredDraftCollection>;
      const normalized = Array.isArray(parsed.drafts) ? parsed.drafts.map(normalizeExamDraft).filter((draft): draft is ExamDraft => Boolean(draft)) : [];
      const drafts = sortDraftsByRecency(normalized).slice(0, MAX_STORED_DRAFTS);
      const requested = typeof parsed.activeDraftId === "string" ? parsed.activeDraftId : "";
      const activeDraftId = drafts.some((draft) => draft.id === requested) ? requested : drafts[0]?.id ?? "";
      return { schemaVersion: 1, activeDraftId, drafts };
    } catch { localStorage.removeItem(DRAFTS_KEY); localStorage.removeItem(ACTIVE_DRAFT_ID_KEY); }
  }
  const legacy = readLegacyDraft();
  if (!legacy) return { schemaVersion: 1, activeDraftId: "", drafts: [] };
  return { schemaVersion: 1, activeDraftId: legacy.id, drafts: [legacy] };
}

function writeDraftCollection(collection: StoredDraftCollection): void {
  let drafts = sortDraftsByRecency(collection.drafts).slice(0, MAX_STORED_DRAFTS);
  let activeDraftId = drafts.some((draft) => draft.id === collection.activeDraftId) ? collection.activeDraftId : drafts[0]?.id ?? "";
  while (true) {
    try {
      localStorage.setItem(DRAFTS_KEY, JSON.stringify({ schemaVersion: 1, activeDraftId, drafts }));
      if (activeDraftId) localStorage.setItem(ACTIVE_DRAFT_ID_KEY, activeDraftId); else localStorage.removeItem(ACTIVE_DRAFT_ID_KEY);
      break;
    } catch (error) {
      let index = -1;
      for (let i = drafts.length - 1; i >= 0; i -= 1) {
        if (drafts[i]?.id !== activeDraftId) { index = i; break; }
      }
      if (index < 0) throw error;
      drafts = drafts.filter((_, i) => i !== index);
      activeDraftId = drafts.some((draft) => draft.id === activeDraftId) ? activeDraftId : drafts[0]?.id ?? "";
    }
  }
  const active = drafts.find((draft) => draft.id === activeDraftId) ?? drafts[0];
  try { if (active) localStorage.setItem(DRAFT_KEY, JSON.stringify(active)); else localStorage.removeItem(DRAFT_KEY); }
  catch { localStorage.removeItem(DRAFT_KEY); }
}

export function saveDraft(draft: ExamDraft): void { const c = readDraftCollection(); writeDraftCollection({ schemaVersion: 1, activeDraftId: draft.id, drafts: [...c.drafts.filter((d) => d.id !== draft.id), draft] }); }
export function loadDraft(draftId?: string): ExamDraft | null { const c = readDraftCollection(); const id = draftId || localStorage.getItem(ACTIVE_DRAFT_ID_KEY) || c.activeDraftId; const d = c.drafts.find((x) => x.id === id) ?? c.drafts[0]; return d ? normalizeExamDraft(d) : null; }
export function loadDrafts(): ExamDraft[] { return readDraftCollection().drafts.map(normalizeExamDraft).filter((d): d is ExamDraft => Boolean(d)); }
export function setActiveDraftId(draftId: string): void { const c = readDraftCollection(); if (c.drafts.some((d) => d.id === draftId)) writeDraftCollection({ ...c, activeDraftId: draftId }); }
export function clearDraft(draftId?: string): void { const c = readDraftCollection(); const id = draftId || localStorage.getItem(ACTIVE_DRAFT_ID_KEY) || c.activeDraftId; const drafts = c.drafts.filter((d) => d.id !== id); writeDraftCollection({ schemaVersion: 1, activeDraftId: drafts[0]?.id ?? "", drafts }); }
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
export function saveSources(sources: ManagedSource[]): void { localStorage.setItem(SOURCES_KEY, JSON.stringify({ schemaVersion: 1, sources })); }

function readSourceArray(raw: string): ManagedSource[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const values = Array.isArray(parsed) ? parsed : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { sources?: unknown }).sources) ? (parsed as { sources: unknown[] }).sources : null;
    if (!values) return null;
    const normalized = values.map(normalizeManagedSource).filter((source): source is ManagedSource => source !== null);
    return normalized.length === values.length ? normalized : null;
  } catch { return null; }
}

export function loadSources(): ManagedSource[] | null {
  const current = localStorage.getItem(SOURCES_KEY);
  if (current) { const sources = readSourceArray(current); if (sources) return sources; localStorage.removeItem(SOURCES_KEY); }
  const legacy = localStorage.getItem(LEGACY_SOURCES_KEY); if (!legacy) return null;
  const migrated = readSourceArray(legacy); if (!migrated) { localStorage.removeItem(LEGACY_SOURCES_KEY); return null; }
  saveSources(migrated); localStorage.removeItem(LEGACY_SOURCES_KEY); return migrated;
}
