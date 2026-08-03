import type {
  AssessmentType,
  CognitiveLevel,
  Difficulty,
  ItemDifficulty,
  QuestionDesignPattern,
  QuestionType,
  QuestionVisualSpec,
  QuestionVisualType,
  ScientificItemModel,
} from "../types.js";

export const ASSESSMENT_ENGINE_SCHEMA_VERSION = 1 as const;
export const ASSESSMENT_CONTRACT_VERSION = 1 as const;
export const ASSESSMENT_BLUEPRINT_VERSION = 1 as const;

export type AssessmentScenarioTarget =
  | "scientific_abstract"
  | "door_handle"
  | "playground_seesaw"
  | "wrench_tool"
  | "bicycle_brake"
  | "shopping_trolley"
  | "school_bag"
  | "water_tank"
  | "solar_panel"
  | "laboratory_setup"
  | "road_safety";

export type AssessmentStimulusTarget =
  | "concise_text"
  | "real_life_scene"
  | "scientific_diagram"
  | "data_table"
  | "graph"
  | "instrument"
  | "experiment"
  | "decision_case";

export type AssessmentSkillTarget =
  | "recognize"
  | "apply"
  | "calculate"
  | "interpret"
  | "compare"
  | "evaluate"
  | "investigate";

export type ScientificContractKey =
  | "moment"
  | "force"
  | "electrostatic"
  | "pressure"
  | "circuit"
  | "optics"
  | "instrument"
  | "graph"
  | "table"
  | "process"
  | "generic";

export type AssessmentGenerationRunStatus =
  | "queued"
  | "running"
  | "reviewing"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled"
  | "superseded";

export type AssessmentGenerationItemStatus =
  | "queued"
  | "grounding"
  | "generating"
  | "normalizing"
  | "validating"
  | "ready"
  | "retry_pending"
  | "failed"
  | "cancelled"
  | "superseded";

export type AssessmentEngineErrorCode =
  | "INVALID_BLUEPRINT"
  | "INVALID_ITEM_CONTRACT"
  | "STALE_PLAN"
  | "STALE_SOURCE"
  | "SOURCE_NOT_FOUND"
  | "SOURCE_ACCESS_DENIED"
  | "SOURCE_NOT_GROUNDED"
  | "MODEL_TIMEOUT"
  | "MODEL_RATE_LIMITED"
  | "MODEL_UNAVAILABLE"
  | "MODEL_INVALID_JSON"
  | "MODEL_INCOMPLETE_CONTENT"
  | "MODEL_SCIENTIFIC_MISMATCH"
  | "MODEL_ASSESSMENT_MISMATCH"
  | "GLOBAL_DUPLICATION"
  | "CANCELLED_BY_USER"
  | "SUPERSEDED_BY_NEW_RUN"
  | "INTERNAL_ERROR";

export type AssessmentEngineRetryClass =
  | "none"
  | "transport_once"
  | "content_once"
  | "manual_source_refresh"
  | "manual_authentication";

export interface AssessmentSourceSnapshot {
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

/** مدخل نقي للنواة، مستقل عن عقود المحرك السابق. */
export interface AssessmentItemSeed {
  planItemId: string;
  lessonId: string;
  lessonLabel: string;
  outcomeId: string;
  outcomeLabel: string;
  questionType: QuestionType;
  cognitiveLevel: CognitiveLevel;
  difficultyLevel?: ItemDifficulty;
  marks: number;
  styleTarget: QuestionDesignPattern;
  visualTarget: QuestionVisualType;
  scenarioTarget: AssessmentScenarioTarget;
  stimulusTarget: AssessmentStimulusTarget;
  skillTarget: AssessmentSkillTarget;
  diversityKey: string;
  sourceReferenceId: string;
  scientificContractKey: ScientificContractKey;
  scientificRequirements: string[];
}

export interface AssessmentBlueprintItem {
  order: number;
  planItemId: string;
  lessonId: string;
  lessonLabel: string;
  outcomeId: string;
  outcomeLabel: string;
  questionType: QuestionType;
  cognitiveLevel: CognitiveLevel;
  difficultyLevel?: ItemDifficulty;
  marks: number;
  styleTarget: QuestionDesignPattern;
  visualTarget: QuestionVisualType;
  scenarioTarget: AssessmentScenarioTarget;
  stimulusTarget: AssessmentStimulusTarget;
  skillTarget: AssessmentSkillTarget;
  diversityKey: string;
  numericSeed: number;
  scientificContractKey: ScientificContractKey;
  scientificRequirements: string[];
  source: AssessmentSourceSnapshot;
}

export interface AssessmentBlueprint {
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

export interface AssessmentItemContract {
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
  outcomeId: string;
  outcomeLabel: string;
  questionType: QuestionType;
  cognitiveLevel: CognitiveLevel;
  difficultyLevel?: ItemDifficulty;
  marks: number;
  styleTarget: QuestionDesignPattern;
  visualTarget: QuestionVisualType;
  scenarioTarget: AssessmentScenarioTarget;
  stimulusTarget: AssessmentStimulusTarget;
  skillTarget: AssessmentSkillTarget;
  diversityKey: string;
  numericSeed: number;
  scientificContractKey: ScientificContractKey;
  scientificRequirements: string[];
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
  needsReview: boolean;
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
  scientificItem?: ScientificItemModel;
  model: string;
  generatedAt: string;
  requestId: string;
  durationMs: number;
}

export interface AssessmentGenerationStageTimings {
  groundingMs: number;
  modelMs: number;
  normalizationMs: number;
  validationMs: number;
  totalMs: number;
}

export interface AssessmentGenerationItemSnapshot {
  id: string;
  runId: string;
  planItemId: string;
  contractHash: string;
  status: AssessmentGenerationItemStatus;
  attemptCount: number;
  maxAttempts: number;
  errorCode: AssessmentEngineErrorCode | "";
  errorMessage: string;
  stageTimings: AssessmentGenerationStageTimings;
  result?: AssessmentGeneratedItemResult;
  startedAt: string;
  completedAt: string;
  updatedAt: string;
}

export interface AssessmentGenerationRunSnapshot {
  id: string;
  draftId: string;
  generationEpoch: number;
  planHash: string;
  sourceSnapshotHash: string;
  status: AssessmentGenerationRunStatus;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  items: AssessmentGenerationItemSnapshot[];
  startedAt: string;
  completedAt: string;
  updatedAt: string;
}

export const MODEL_ALLOWED_OUTPUT_FIELDS = Object.freeze([
  "stimulus",
  "text",
  "options",
  "answer",
  "rationale",
  "markScheme",
  "needsReview",
] as const);

export const MODEL_FORBIDDEN_OUTPUT_FIELDS = Object.freeze([
  "planItemId",
  "sourceEvidenceId",
  "enrichmentEvidenceId",
  "sourceSupport",
  "enrichmentSupport",
  "enrichmentSourceTitle",
  "enrichmentSourceUrl",
  "lessonId",
  "sourceId",
  "chunkIndex",
  "visualTarget",
  "visual",
  "scientificItem",
  "marks",
  "questionType",
  "questionForm",
  "workingRequired",
  "contractHash",
  "model",
  "generatedAt",
  "requestId",
] as const);
