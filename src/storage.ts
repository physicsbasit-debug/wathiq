import type { ExamDraft, ExamSourceReference, ExamTitleOption, ManagedSource, PlanItem } from "./types.js";
import type { LessonCatalogOption } from "./lesson-catalog.js";
import { applyOfficialAssessmentTemplate, createEmptyDraft, toDateInputValue } from "./domain.js";
import { SCIENCE_ASSESSMENT_POLICY_ID, assessmentTypeForTitle, getOfficialAssessmentSpec, isExamTitleOption } from "./assessment-policy.js";
import { normalizeManagedSource } from "./source-registry.js";
import { SOURCE_GENERATION_VERSION } from "./question-generation.js";
import { ASSESSMENT_GENERATION_V2_VERSION } from "./assessment-generation-v2.js";
import { diversifyQuestionVisualSpec } from "./question-visual.js";
import { SOURCE_RETRIEVAL_VERSION } from "./source-retrieval.js";

const DRAFT_KEY = "wathiq.phase0b.latestDraft";
const DRAFTS_KEY = "wathiq.examDrafts.v1";
const ACTIVE_DRAFT_ID_KEY = "wathiq.activeDraftId.v1";
const DRAFT_CONTEXTS_KEY = "wathiq.examDraftContexts.v1";
const MAX_STORED_DRAFTS = 12;
const PROFILE_KEY = "wathiq.phase0b.profile";
const SOURCES_KEY = "wathiq.phase0d.sourceRegistry";
const LEGACY_SOURCES_KEY = "wathiq.phase0c.sources";

const COMPATIBLE_GENERATION_VERSIONS = new Set([
  SOURCE_GENERATION_VERSION,
  "source-grounded-policy-ai-14-contextual-stimulus-alignment",
  "source-grounded-policy-ai-13-trusted-enrichment",
  "source-grounded-policy-ai-12-advanced-visuals",
]);


export interface DraftResumeContext {
  schemaVersion: 1;
  draftId: string;
  selectionKey: string;
  activeUnitKey: string;
  lessonCatalog: LessonCatalogOption[];
  savedAt: string;
}

interface StoredDraftContextCollection {
  schemaVersion: 1;
  contexts: DraftResumeContext[];
}

function normalizeLessonCatalogSnapshot(value: unknown): LessonCatalogOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const item = entry as Partial<LessonCatalogOption>;
    if (typeof item.id !== "string" || typeof item.sourceId !== "string" || typeof item.sourceTitle !== "string"
      || typeof item.label !== "string" || typeof item.code !== "string" || typeof item.title !== "string") return [];
    const origin = item.origin === "approved-structure" || item.origin === "validated-structure"
      || item.origin === "curated-book-tree" || item.origin === "detected-heading"
      ? item.origin
      : "detected-heading";
    return [{
      id: item.id,
      sourceId: item.sourceId,
      sourceTitle: item.sourceTitle,
      label: item.label,
      code: item.code,
      title: item.title,
      ...(typeof item.pageStart === "number" ? { pageStart: item.pageStart } : {}),
      ...(typeof item.pageEnd === "number" ? { pageEnd: item.pageEnd } : {}),
      ...(typeof item.unitLabel === "string" && item.unitLabel.trim() ? { unitLabel: item.unitLabel.trim() } : {}),
      origin,
    }];
  });
}

function readDraftContextCollection(): StoredDraftContextCollection {
  const raw = localStorage.getItem(DRAFT_CONTEXTS_KEY);
  if (!raw) return { schemaVersion: 1, contexts: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<StoredDraftContextCollection>;
    const contexts = Array.isArray(parsed.contexts)
      ? parsed.contexts.flatMap((entry) => {
          if (typeof entry !== "object" || entry === null) return [];
          const item = entry as Partial<DraftResumeContext>;
          if (typeof item.draftId !== "string" || !item.draftId) return [];
          return [{
            schemaVersion: 1 as const,
            draftId: item.draftId,
            selectionKey: typeof item.selectionKey === "string" ? item.selectionKey : "",
            activeUnitKey: typeof item.activeUnitKey === "string" ? item.activeUnitKey : "",
            lessonCatalog: normalizeLessonCatalogSnapshot(item.lessonCatalog),
            savedAt: typeof item.savedAt === "string" ? item.savedAt : "",
          }];
        })
      : [];
    return { schemaVersion: 1, contexts };
  } catch {
    localStorage.removeItem(DRAFT_CONTEXTS_KEY);
    return { schemaVersion: 1, contexts: [] };
  }
}

function writeDraftContextCollection(collection: StoredDraftContextCollection): void {
  const contexts = collection.contexts
    .sort((left, right) => Date.parse(right.savedAt || "") - Date.parse(left.savedAt || ""))
    .slice(0, MAX_STORED_DRAFTS);
  localStorage.setItem(DRAFT_CONTEXTS_KEY, JSON.stringify({ schemaVersion: 1, contexts }));
}

export function saveDraftResumeContext(context: DraftResumeContext): void {
  const collection = readDraftContextCollection();
  const contexts = collection.contexts.filter((item) => item.draftId !== context.draftId);
  contexts.push({ ...context, schemaVersion: 1, lessonCatalog: normalizeLessonCatalogSnapshot(context.lessonCatalog) });
  writeDraftContextCollection({ schemaVersion: 1, contexts });
}

export function loadDraftResumeContext(draftId: string): DraftResumeContext | null {
  if (!draftId) return null;
  return readDraftContextCollection().contexts.find((item) => item.draftId === draftId) ?? null;
}

export function clearDraftResumeContext(draftId: string): void {
  if (!draftId) return;
  const collection = readDraftContextCollection();
  writeDraftContextCollection({ schemaVersion: 1, contexts: collection.contexts.filter((item) => item.draftId !== draftId) });
}

export interface SavedProfile {
  school: string;
  directorate: string;
}

function normalizeSourceReferences(value: unknown): ExamSourceReference[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const item = entry as Partial<ExamSourceReference>;
    if (
      typeof item.id !== "string" ||
      typeof item.sourceId !== "string" ||
      typeof item.sourceTitle !== "string" ||
      typeof item.sourceKind !== "string" ||
      typeof item.pageFrom !== "number" ||
      typeof item.pageTo !== "number" ||
      typeof item.excerpt !== "string" ||
      typeof item.score !== "number"
    ) return [];
    const reference: ExamSourceReference = {
      id: item.id,
      sourceId: item.sourceId,
      sourceTitle: item.sourceTitle,
      sourceKind: item.sourceKind,
      pageFrom: item.pageFrom,
      pageTo: item.pageTo,
      excerpt: item.excerpt,
      score: item.score,
    };
    if (typeof item.context === "string" && item.context.trim()) reference.context = item.context;
    if (typeof item.lessonTopic === "string" && item.lessonTopic.trim()) reference.lessonTopic = item.lessonTopic.trim();
    return [reference];
  });
}

function normalizeStoredPlan(value: unknown): PlanItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (typeof entry !== "object" || entry === null) return [];
    const item = entry as PlanItem;
    if (typeof item.id !== "string" || !Array.isArray(item.proposals)) return [];
    if (!item.visual || typeof item.visual !== "object") return [item];
    try {
      return [{ ...item, visual: diversifyQuestionVisualSpec(item.visual, index, item.id) }];
    } catch {
      const { visual: _visual, ...withoutVisual } = item;
      return [withoutVisual];
    }
  });
}

export function normalizeExamDraft(value: unknown): ExamDraft | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<ExamDraft>;
  const base = createEmptyDraft();
  const candidatePolicyId = typeof candidate.assessmentPolicyId === "string" ? candidate.assessmentPolicyId : "";
  const normalizedTitle: ExamTitleOption = typeof candidate.title === "string" && isExamTitleOption(candidate.title)
    ? candidate.title
    : "الاختبار القصير الأول";
  const draft: ExamDraft = {
    ...base,
    ...candidate,
    assessmentType: assessmentTypeForTitle(normalizedTitle),
    assessmentPolicyId: candidatePolicyId || base.assessmentPolicyId,
    grade: typeof candidate.grade === "number" ? candidate.grade : null,
    subjectId: typeof candidate.subjectId === "string" ? candidate.subjectId : "",
    unitId: typeof candidate.unitId === "string" ? candidate.unitId : "",
    lessonIds: Array.isArray(candidate.lessonIds) ? candidate.lessonIds.filter((item): item is string => typeof item === "string") : [],
    outcomeIds: Array.isArray(candidate.outcomeIds) ? candidate.outcomeIds.filter((item): item is string => typeof item === "string") : [],
    lessonTopics: Array.isArray(candidate.lessonTopics)
      ? candidate.lessonTopics.filter((item): item is string => typeof item === "string").slice(0, 5)
      : (typeof candidate.topic === "string" && candidate.topic.trim() ? [candidate.topic.trim(), ""] : ["", ""]),
    topic: typeof candidate.topic === "string" ? candidate.topic : "",
    sourceReferences: normalizeSourceReferences(candidate.sourceReferences),
    sourceRetrievalVersion: typeof candidate.sourceRetrievalVersion === "string" ? candidate.sourceRetrievalVersion : "",
    title: normalizedTitle,
    trustedEnrichmentEnabled: candidate.trustedEnrichmentEnabled !== false,
    visualEnhancementEnabled: candidate.visualEnhancementEnabled !== false,
    generationMode: candidate.generationMode === "legacy_items"
      ? "legacy_items"
      : candidate.generationMode === "whole_exam_v2"
        ? "whole_exam_v2"
        : (typeof candidate.generationVersion === "string" && candidate.generationVersion.trim() ? "legacy_items" : "whole_exam_v2"),
    examDate: typeof candidate.examDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(candidate.examDate)
      ? candidate.examDate
      : toDateInputValue(),
    counts: {
      mcq: typeof candidate.counts?.mcq === "number" ? candidate.counts.mcq : base.counts.mcq,
      short: typeof candidate.counts?.short === "number" ? candidate.counts.short : base.counts.short,
      long: typeof candidate.counts?.long === "number" ? candidate.counts.long : base.counts.long,
    },
    plan: normalizeStoredPlan(candidate.plan),
    selectedProposalByPlanItem: typeof candidate.selectedProposalByPlanItem === "object" && candidate.selectedProposalByPlanItem !== null
      ? candidate.selectedProposalByPlanItem as Record<string, string>
      : {},
    generationVersion: typeof candidate.generationVersion === "string" ? candidate.generationVersion : "",
    generationModel: typeof candidate.generationModel === "string" ? candidate.generationModel : "",
    generatedAt: typeof candidate.generatedAt === "string" ? candidate.generatedAt : "",
    approvedAt: typeof candidate.approvedAt === "string" ? candidate.approvedAt : "",
    status: candidate.status === "معتمد" || candidate.status === "جاهز للمراجعة" ? candidate.status : "مسودة",
  };
  if (draft.generationVersion === ASSESSMENT_GENERATION_V2_VERSION) {
    draft.generationMode = "whole_exam_v2";
  } else if (COMPATIBLE_GENERATION_VERSIONS.has(draft.generationVersion)) {
    draft.generationVersion = SOURCE_GENERATION_VERSION;
    draft.generationMode = "legacy_items";
  }

  const officialSpec = getOfficialAssessmentSpec(draft.grade, draft.title);
  const requiresPolicyMigration = Boolean(officialSpec && candidatePolicyId !== SCIENCE_ASSESSMENT_POLICY_ID);
  if (requiresPolicyMigration) applyOfficialAssessmentTemplate(draft);

  const generatedPlanItems = draft.plan.filter((item) => item.proposals.some((proposal) =>
    typeof proposal?.text === "string" && proposal.text.trim().length > 0
      && typeof proposal?.answer === "string" && proposal.answer.trim().length > 0,
  ));
  const hasGeneratedContent = generatedPlanItems.length > 0;
  const hasPlanProgress = draft.plan.length > 0;
  const requestedStep = Number(candidate.currentStep) || 1;
  if (draft.lessonTopics.filter((item) => item.trim()).length < 2 && draft.plan.length) {
    const recoveredLessons = [...new Set(draft.plan.map((item) => item.lessonLabel?.trim()).filter(Boolean))].slice(0, 5);
    if (recoveredLessons.length >= 2) draft.lessonTopics = recoveredLessons;
  }
  if (draft.lessonTopics.length < 2) draft.lessonTopics = [...draft.lessonTopics, ...Array.from({ length: 2 - draft.lessonTopics.length }, () => "")];
  draft.topic = draft.lessonTopics.map((item) => item.trim()).filter(Boolean).join("، ");

  const resetToContent = (clearReferences: boolean): void => {
    draft.currentStep = 1;
    if (clearReferences) {
      draft.sourceReferences = [];
      draft.sourceRetrievalVersion = "";
    }
    draft.plan = [];
    draft.selectedProposalByPlanItem = {};
    draft.generationVersion = "";
    draft.generationModel = "";
    draft.generatedAt = "";
    draft.approvedAt = "";
    draft.status = "مسودة";
  };

  const lessonCount = draft.lessonTopics.filter((item) => item.trim()).length;
  if (lessonCount < 2 || draft.sourceReferences.length === 0) {
    if (hasGeneratedContent) {
      // لا نمحو اختبارًا مولدًا عند تعذر استعادة مصدره محليًا؛ يبقى قابلًا للمراجعة والتصدير.
      draft.currentStep = Math.max(3, requestedStep) as ExamDraft["currentStep"];
    } else if (hasPlanProgress || lessonCount >= 2) {
      // المسودة الجزئية عمل حقيقي أيضًا: نعيدها إلى الإعداد بدل إيهام المستخدم بأنه بدأ اختبارًا جديدًا.
      draft.currentStep = Math.max(2, Math.min(3, requestedStep)) as ExamDraft["currentStep"];
    } else {
      resetToContent(false);
    }
  } else if (draft.sourceRetrievalVersion !== SOURCE_RETRIEVAL_VERSION) {
    if (hasGeneratedContent) {
      // تحديث خوارزمية الاسترجاع لا يبرر حذف عمل المستخدم المكتمل؛ يُعاد الاسترجاع فقط عند تغيير الدروس.
      draft.currentStep = Math.max(3, requestedStep) as ExamDraft["currentStep"];
    } else {
      // نحافظ على اختيارات المستخدم والخطة، ونعود إلى الإعداد لإعادة ربط المقاطع عند المتابعة.
      draft.currentStep = Math.max(2, Math.min(3, requestedStep)) as ExamDraft["currentStep"];
      draft.sourceRetrievalVersion = "";
    }
  } else if (draft.currentStep >= 3 && draft.generationVersion !== (draft.generationMode === "whole_exam_v2" ? ASSESSMENT_GENERATION_V2_VERSION : SOURCE_GENERATION_VERSION)) {
    if (hasGeneratedContent) {
      // نحافظ على الأسئلة القديمة للمراجعة بدل إتلافها عند ترقية عقد التوليد.
      draft.currentStep = Math.max(3, requestedStep) as ExamDraft["currentStep"];
      draft.status = draft.status === "معتمد" ? "معتمد" : "جاهز للمراجعة";
    } else if (hasPlanProgress) {
      // الخطة الرسمية لا تعتمد على صياغة نموذج بعينه؛ يمكن إعادة المحاولة بعقد التوليد الحالي دون هدمها.
      draft.currentStep = 3;
      draft.generationVersion = "";
      draft.generationModel = "";
      draft.generatedAt = "";
      draft.status = "مسودة";
    } else {
      draft.currentStep = 2;
      draft.selectedProposalByPlanItem = {};
      draft.generationVersion = "";
      draft.generationModel = "";
      draft.generatedAt = "";
      draft.approvedAt = "";
      draft.status = "مسودة";
    }
  }
  return draft;
}

interface StoredDraftCollection {
  schemaVersion: 1;
  activeDraftId: string;
  drafts: ExamDraft[];
}

function draftTimestamp(draft: ExamDraft): number {
  const value = Date.parse(draft.updatedAt || "");
  return Number.isFinite(value) ? value : 0;
}

function sortDraftsByRecency(drafts: ExamDraft[]): ExamDraft[] {
  return [...drafts].sort((left, right) => draftTimestamp(right) - draftTimestamp(left));
}

function readLegacyDraft(): ExamDraft | null {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    return normalizeExamDraft(JSON.parse(raw));
  } catch {
    localStorage.removeItem(DRAFT_KEY);
    return null;
  }
}

function readDraftCollection(): StoredDraftCollection {
  const raw = localStorage.getItem(DRAFTS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<StoredDraftCollection>;
      const normalized = Array.isArray(parsed.drafts)
        ? parsed.drafts.map(normalizeExamDraft).filter((draft): draft is ExamDraft => Boolean(draft))
        : [];
      const drafts = sortDraftsByRecency(normalized).slice(0, MAX_STORED_DRAFTS);
      const requestedActive = typeof parsed.activeDraftId === "string" ? parsed.activeDraftId : "";
      const activeDraftId = drafts.some((draft) => draft.id === requestedActive)
        ? requestedActive
        : drafts[0]?.id ?? "";
      return { schemaVersion: 1, activeDraftId, drafts };
    } catch {
      localStorage.removeItem(DRAFTS_KEY);
      localStorage.removeItem(ACTIVE_DRAFT_ID_KEY);
    }
  }
  const legacy = readLegacyDraft();
  if (!legacy) return { schemaVersion: 1, activeDraftId: "", drafts: [] };
  const migrated: StoredDraftCollection = { schemaVersion: 1, activeDraftId: legacy.id, drafts: [legacy] };
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(migrated));
  localStorage.setItem(ACTIVE_DRAFT_ID_KEY, legacy.id);
  return migrated;
}

function writeDraftCollection(collection: StoredDraftCollection): void {
  let drafts = sortDraftsByRecency(collection.drafts).slice(0, MAX_STORED_DRAFTS);
  let activeDraftId = drafts.some((draft) => draft.id === collection.activeDraftId)
    ? collection.activeDraftId
    : drafts[0]?.id ?? "";

  while (true) {
    const payload: StoredDraftCollection = { schemaVersion: 1, activeDraftId, drafts };
    try {
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(payload));
      if (activeDraftId) localStorage.setItem(ACTIVE_DRAFT_ID_KEY, activeDraftId);
      else localStorage.removeItem(ACTIVE_DRAFT_ID_KEY);
      break;
    } catch (error) {
      let removableIndex = -1;
      for (let index = drafts.length - 1; index >= 0; index -= 1) {
        if (drafts[index]?.id !== activeDraftId) {
          removableIndex = index;
          break;
        }
      }
      if (removableIndex < 0) throw error;
      drafts = drafts.filter((_, index) => index !== removableIndex);
      activeDraftId = drafts.some((draft) => draft.id === activeDraftId)
        ? activeDraftId
        : drafts[0]?.id ?? "";
    }
  }

  const activeDraft = drafts.find((draft) => draft.id === activeDraftId) ?? drafts[0];
  try {
    if (activeDraft) localStorage.setItem(DRAFT_KEY, JSON.stringify(activeDraft));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // المفتاح القديم للتوافق فقط؛ نجاح مخزن المسودات المتعددة هو الحفظ المعتمد.
    localStorage.removeItem(DRAFT_KEY);
  }
}

export function saveDraft(draft: ExamDraft): void {
  const collection = readDraftCollection();
  const drafts = collection.drafts.filter((item) => item.id !== draft.id);
  drafts.push(draft);
  writeDraftCollection({ schemaVersion: 1, activeDraftId: draft.id, drafts });
}

export function loadDraft(draftId?: string): ExamDraft | null {
  const collection = readDraftCollection();
  const activeId = draftId || localStorage.getItem(ACTIVE_DRAFT_ID_KEY) || collection.activeDraftId;
  const draft = collection.drafts.find((item) => item.id === activeId) ?? collection.drafts[0];
  return draft ? normalizeExamDraft(draft) : null;
}

export function loadDrafts(): ExamDraft[] {
  return readDraftCollection().drafts.map((draft) => normalizeExamDraft(draft)).filter((draft): draft is ExamDraft => Boolean(draft));
}

export function setActiveDraftId(draftId: string): void {
  const collection = readDraftCollection();
  if (!collection.drafts.some((draft) => draft.id === draftId)) return;
  writeDraftCollection({ ...collection, activeDraftId: draftId });
}

export function clearDraft(draftId?: string): void {
  const collection = readDraftCollection();
  const targetId = draftId || localStorage.getItem(ACTIVE_DRAFT_ID_KEY) || collection.activeDraftId;
  const drafts = collection.drafts.filter((draft) => draft.id !== targetId);
  writeDraftCollection({ schemaVersion: 1, activeDraftId: drafts[0]?.id ?? "", drafts });
  clearDraftResumeContext(targetId);
}

export function saveProfile(profile: SavedProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function loadProfile(): SavedProfile | null {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SavedProfile;
  } catch {
    localStorage.removeItem(PROFILE_KEY);
    return null;
  }
}


export function saveSources(sources: ManagedSource[]): void {
  localStorage.setItem(SOURCES_KEY, JSON.stringify({ schemaVersion: 1, sources }));
}

function readSourceArray(raw: string): ManagedSource[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const values = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { sources?: unknown }).sources)
        ? (parsed as { sources: unknown[] }).sources
        : null;
    if (!values) return null;
    const normalized = values.map(normalizeManagedSource).filter((source): source is ManagedSource => source !== null);
    return normalized.length === values.length ? normalized : null;
  } catch {
    return null;
  }
}

export function loadSources(): ManagedSource[] | null {
  const current = localStorage.getItem(SOURCES_KEY);
  if (current) {
    const sources = readSourceArray(current);
    if (sources) return sources;
    localStorage.removeItem(SOURCES_KEY);
  }

  const legacy = localStorage.getItem(LEGACY_SOURCES_KEY);
  if (!legacy) return null;
  const migrated = readSourceArray(legacy);
  if (!migrated) {
    localStorage.removeItem(LEGACY_SOURCES_KEY);
    return null;
  }
  saveSources(migrated);
  localStorage.removeItem(LEGACY_SOURCES_KEY);
  return migrated;
}
