import type { ExamDraft, ExamSourceReference, ExamTitleOption, ManagedSource, PlanItem } from "./types.js";
import { applyOfficialAssessmentTemplate, createEmptyDraft, toDateInputValue } from "./domain.js";
import { SCIENCE_ASSESSMENT_POLICY_ID, assessmentTypeForTitle, getOfficialAssessmentSpec, isExamTitleOption } from "./assessment-policy.js";
import { normalizeManagedSource } from "./source-registry.js";
import { SOURCE_GENERATION_VERSION } from "./question-generation.js";
import { ASSESSMENT_GENERATION_V2_VERSION } from "./assessment-generation-v2.js";
import { diversifyQuestionVisualSpec } from "./question-visual.js";
import { SOURCE_RETRIEVAL_VERSION } from "./source-retrieval.js";

const DRAFT_KEY = "wathiq.phase0b.latestDraft";
const PROFILE_KEY = "wathiq.phase0b.profile";
const SOURCES_KEY = "wathiq.phase0d.sourceRegistry";
const LEGACY_SOURCES_KEY = "wathiq.phase0c.sources";

const COMPATIBLE_GENERATION_VERSIONS = new Set([
  SOURCE_GENERATION_VERSION,
  "source-grounded-policy-ai-14-contextual-stimulus-alignment",
  "source-grounded-policy-ai-13-trusted-enrichment",
  "source-grounded-policy-ai-12-advanced-visuals",
]);

export interface SavedProfile {
  school: string;
  directorate: string;
}

export function saveDraft(draft: ExamDraft): void {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
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

  if (draft.lessonTopics.length < 2) draft.lessonTopics = [...draft.lessonTopics, ...Array.from({ length: 2 - draft.lessonTopics.length }, () => "")];
  draft.topic = draft.lessonTopics.map((item) => item.trim()).filter(Boolean).join("، ");

  if (draft.lessonTopics.filter((item) => item.trim()).length < 2 || draft.sourceReferences.length === 0) {
    draft.currentStep = 1;
    draft.plan = [];
    draft.selectedProposalByPlanItem = {};
    draft.generationVersion = "";
    draft.generationModel = "";
    draft.generatedAt = "";
    draft.approvedAt = "";
    draft.status = "مسودة";
  } else if (draft.sourceRetrievalVersion !== SOURCE_RETRIEVAL_VERSION) {
    draft.currentStep = 1;
    draft.sourceReferences = [];
    draft.sourceRetrievalVersion = "";
    draft.plan = [];
    draft.selectedProposalByPlanItem = {};
    draft.generationVersion = "";
    draft.generationModel = "";
    draft.generatedAt = "";
    draft.approvedAt = "";
    draft.status = "مسودة";
  } else if (draft.currentStep >= 3 && draft.generationVersion !== (draft.generationMode === "whole_exam_v2" ? ASSESSMENT_GENERATION_V2_VERSION : SOURCE_GENERATION_VERSION)) {
    draft.currentStep = 2;
    draft.plan = [];
    draft.selectedProposalByPlanItem = {};
    draft.generationVersion = "";
    draft.generationModel = "";
    draft.generatedAt = "";
    draft.approvedAt = "";
    draft.status = "مسودة";
  }
  return draft;
}

export function loadDraft(): ExamDraft | null {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    const normalized = normalizeExamDraft(JSON.parse(raw));
    if (!normalized) throw new Error("invalid draft");
    return normalized;
  } catch {
    localStorage.removeItem(DRAFT_KEY);
    return null;
  }
}

export function clearDraft(): void {
  localStorage.removeItem(DRAFT_KEY);
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
