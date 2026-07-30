import type { ExamDraft, ExamSourceReference, ManagedSource } from "./types.js";
import { applyOfficialShortTestTemplate, createEmptyDraft } from "./domain.js";
import { SCIENCE_ASSESSMENT_POLICY_ID, getOfficialShortTestSpec } from "./assessment-policy.js";
import { normalizeManagedSource } from "./source-registry.js";

const DRAFT_KEY = "wathiq.phase0b.latestDraft";
const PROFILE_KEY = "wathiq.phase0b.profile";
const SOURCES_KEY = "wathiq.phase0d.sourceRegistry";
const LEGACY_SOURCES_KEY = "wathiq.phase0c.sources";

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
    return [reference];
  });
}

export function normalizeExamDraft(value: unknown): ExamDraft | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<ExamDraft>;
  const base = createEmptyDraft();
  const candidatePolicyId = typeof candidate.assessmentPolicyId === "string" ? candidate.assessmentPolicyId : "";
  const draft: ExamDraft = {
    ...base,
    ...candidate,
    assessmentType: "اختبار قصير رسمي",
    assessmentPolicyId: candidatePolicyId || base.assessmentPolicyId,
    grade: typeof candidate.grade === "number" ? candidate.grade : null,
    subjectId: typeof candidate.subjectId === "string" ? candidate.subjectId : "",
    unitId: typeof candidate.unitId === "string" ? candidate.unitId : "",
    lessonIds: Array.isArray(candidate.lessonIds) ? candidate.lessonIds.filter((item): item is string => typeof item === "string") : [],
    outcomeIds: Array.isArray(candidate.outcomeIds) ? candidate.outcomeIds.filter((item): item is string => typeof item === "string") : [],
    topic: typeof candidate.topic === "string" ? candidate.topic : "",
    sourceReferences: normalizeSourceReferences(candidate.sourceReferences),
    counts: {
      mcq: typeof candidate.counts?.mcq === "number" ? candidate.counts.mcq : base.counts.mcq,
      short: typeof candidate.counts?.short === "number" ? candidate.counts.short : base.counts.short,
      long: typeof candidate.counts?.long === "number" ? candidate.counts.long : base.counts.long,
    },
    plan: Array.isArray(candidate.plan) ? candidate.plan : [],
    selectedProposalByPlanItem: typeof candidate.selectedProposalByPlanItem === "object" && candidate.selectedProposalByPlanItem !== null
      ? candidate.selectedProposalByPlanItem as Record<string, string>
      : {},
    generationVersion: typeof candidate.generationVersion === "string" ? candidate.generationVersion : "",
    generationModel: typeof candidate.generationModel === "string" ? candidate.generationModel : "",
    generatedAt: typeof candidate.generatedAt === "string" ? candidate.generatedAt : "",
  };
  const officialSpec = getOfficialShortTestSpec(draft.grade);
  const requiresPolicyMigration = Boolean(officialSpec && candidatePolicyId !== SCIENCE_ASSESSMENT_POLICY_ID);
  if (requiresPolicyMigration) applyOfficialShortTestTemplate(draft);

  if (!draft.topic.trim() || draft.sourceReferences.length === 0) {
    draft.currentStep = 1;
    draft.plan = [];
    draft.selectedProposalByPlanItem = {};
    draft.generationVersion = "";
    draft.generationModel = "";
    draft.generatedAt = "";
  } else if (draft.currentStep >= 3 && draft.generationVersion !== "source-grounded-policy-ai-2") {
    draft.currentStep = 2;
    draft.plan = [];
    draft.selectedProposalByPlanItem = {};
    draft.generationVersion = "";
    draft.generationModel = "";
    draft.generatedAt = "";
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
