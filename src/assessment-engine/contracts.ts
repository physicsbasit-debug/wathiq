import type {
  AssessmentType,
  CambridgeProgrammeId,
  CognitiveLevel,
  Difficulty,
  ItemDifficulty,
  QuestionType,
  QuestionVisualSpec,
} from "../types.js";

export const ASSESSMENT_ENGINE_SCHEMA_VERSION = 1 as const;
export const ASSESSMENT_CONTRACT_VERSION = 3 as const;
export const ASSESSMENT_BLUEPRINT_VERSION = 3 as const;

export type AssessmentGenerationRunStatus =
  | "queued" | "running" | "reviewing" | "completed" | "partial" | "failed" | "cancelled" | "superseded";

export type AssessmentGenerationItemStatus =
  | "queued" | "grounding" | "generating" | "normalizing" | "validating" | "ready" | "retry_pending" | "failed" | "cancelled" | "superseded";

export type AssessmentEngineErrorCode =
  | "INVALID_BLUEPRINT" | "INVALID_ITEM_CONTRACT" | "STALE_PLAN" | "STALE_SOURCE" | "SOURCE_NOT_FOUND"
  | "SOURCE_ACCESS_DENIED" | "SOURCE_NOT_GROUNDED" | "MODEL_TIMEOUT" | "MODEL_RATE_LIMITED" | "MODEL_UNAVAILABLE"
  | "MODEL_INVALID_JSON" | "MODEL_INCOMPLETE_CONTENT" | "MODEL_SCIENTIFIC_MISMATCH" | "MODEL_ASSESSMENT_MISMATCH"
  | "GLOBAL_DUPLICATION" | "CANCELLED_BY_USER" | "SUPERSEDED_BY_NEW_RUN" | "INTERNAL_ERROR";

export type AssessmentEngineRetryClass = "none" | "transport_once" | "content_once" | "manual_source_refresh" | "manual_authentication";
export type AssessmentSourceMode = "global_curriculum" | "uploaded_source";

export interface AssessmentSourceSnapshot {
  mode: AssessmentSourceMode;
  sourceId: string;
  sourceTitle: string;
  sourceKind: string;
  sourceReferenceId: string;
  chunkIndex: number;
  pageFrom: number;
  pageTo: number;
  contentHash: string;
  extractionVersion: string;
}

/** الحد الأدنى الذي يملكه واثق قبل التأليف. المصادر المرفوعة اختيارية. */
export interface AssessmentItemSeed {
  planItemId: string;
  lessonId: string;
  lessonLabel: string;
  questionType: QuestionType;
  cognitiveLevel: CognitiveLevel;
  difficultyLevel?: ItemDifficulty;
  marks: number;
  sourceReferenceId?: string;
}

export interface AssessmentBlueprintItem extends Omit<AssessmentItemSeed, "sourceReferenceId"> {
  order: number;
  source: AssessmentSourceSnapshot;
}

export interface AssessmentCurriculumIdentity {
  programmeId: CambridgeProgrammeId;
  syllabusCode: string;
  stageLabel: string;
}

export interface AssessmentBlueprint extends AssessmentCurriculumIdentity {
  engineSchemaVersion: typeof ASSESSMENT_ENGINE_SCHEMA_VERSION;
  blueprintVersion: typeof ASSESSMENT_BLUEPRINT_VERSION;
  draftId: string;
  generationEpoch: number;
  assessmentType: AssessmentType;
  assessmentPolicyId: string;
  grade: number;
  subject: string;
  topic: string;
  difficulty: Difficulty;
  totalMarks: number;
  itemCount: number;
  planHash: string;
  sourceSnapshotHash: string;
  items: AssessmentBlueprintItem[];
}

export interface AssessmentItemContract extends AssessmentCurriculumIdentity {
  engineSchemaVersion: typeof ASSESSMENT_ENGINE_SCHEMA_VERSION;
  contractVersion: typeof ASSESSMENT_CONTRACT_VERSION;
  draftId: string;
  generationEpoch: number;
  planHash: string;
  assessmentType: AssessmentType;
  assessmentPolicyId: string;
  planItemId: string;
  order: number;
  grade: number;
  subject: string;
  topic: string;
  difficulty: Difficulty;
  lessonId: string;
  lessonLabel: string;
  questionType: QuestionType;
  cognitiveLevel: CognitiveLevel;
  difficultyLevel?: ItemDifficulty;
  marks: number;
  source: AssessmentSourceSnapshot;
  contractHash: string;
}

/** الحقول الوحيدة التي يسمح للنموذج اللغوي بإعادتها. */
export interface AssessmentModelContent {
  stimulus: string;
  text: string;
  options: string[];
  answer: string;
  rationale: string;
  markScheme: string[];
}

export interface AssessmentEvidenceAnchor {
  evidenceIndex: number;
  evidenceHash: string;
  excerpt: string;
  score: number;
}

export interface AssessmentGeneratedItemResult {
  planItemId: string;
  contractHash: string;
  content: AssessmentModelContent;
  evidence: AssessmentEvidenceAnchor;
  visual: QuestionVisualSpec;
  model: string;
  generatedAt: string;
  requestId: string;
  durationMs: number;
}

export interface AssessmentGenerationStageTimings { groundingMs: number; modelMs: number; normalizationMs: number; validationMs: number; totalMs: number; }

export interface AssessmentGenerationItemSnapshot {
  id: string; runId: string; planItemId: string; contractHash: string; status: AssessmentGenerationItemStatus;
  attemptCount: number; maxAttempts: number; errorCode: AssessmentEngineErrorCode | ""; errorMessage: string;
  stageTimings: AssessmentGenerationStageTimings; result?: AssessmentGeneratedItemResult;
  startedAt: string; completedAt: string; updatedAt: string;
}

export interface AssessmentGenerationRunSnapshot {
  id: string; draftId: string; generationEpoch: number; planHash: string; sourceSnapshotHash: string;
  status: AssessmentGenerationRunStatus; totalItems: number; completedItems: number; failedItems: number;
  items: AssessmentGenerationItemSnapshot[]; startedAt: string; completedAt: string; updatedAt: string;
}

export const MODEL_ALLOWED_OUTPUT_FIELDS = Object.freeze(["stimulus", "text", "options", "answer", "rationale", "markScheme"] as const);
export const MODEL_FORBIDDEN_OUTPUT_FIELDS = Object.freeze([
  "planItemId", "sourceEvidenceId", "enrichmentEvidenceId", "sourceSupport", "enrichmentSupport", "enrichmentSourceTitle",
  "enrichmentSourceUrl", "lessonId", "sourceId", "chunkIndex", "visualTarget", "visual", "scientificItem", "marks",
  "questionType", "questionForm", "workingRequired", "contractHash", "model", "generatedAt", "requestId",
] as const);
