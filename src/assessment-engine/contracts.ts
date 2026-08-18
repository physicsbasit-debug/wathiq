// src/assessment-engine/contracts.ts

// ==========================================
// 1. الأنواع الأساسية (مع التوافق الرجعي للملفات القديمة)
// ==========================================

export type AssessmentEngineErrorCode = 
  | 'INVALID_BLUEPRINT' | 'INVALID_ITEM_CONTRACT' | 'STALE_PLAN' | 'AUTHORIZATION_FAILED'
  | 'MODEL_TIMEOUT' | 'MODEL_RATE_LIMITED' | 'MODEL_QUOTA_EXHAUSTED' | 'MODEL_UNAVAILABLE'
  | 'MODEL_REQUEST_INVALID' | 'MODEL_AUTH_FAILED' | 'MODEL_NOT_FOUND' | 'MODEL_OUTPUT_TRUNCATED'
  | 'MODEL_OUTPUT_BLOCKED' | 'MODEL_INVALID_JSON' | 'MODEL_INCOMPLETE_CONTENT'
  | 'MODEL_SCIENTIFIC_MISMATCH' | 'MODEL_ASSESSMENT_MISMATCH' | 'GLOBAL_DUPLICATION'
  | 'CANCELLED_BY_USER' | 'SUPERSEDED_BY_NEW_RUN' | 'INTERNAL_ERROR';

export type AssessmentEngineRetryClass = 'none' | 'manual_authentication' | 'transport_backoff' | 'content_once';

export const ASSESSMENT_BLUEPRINT_VERSION = 1;
export const ASSESSMENT_CONTRACT_VERSION = 1;
export const ASSESSMENT_ENGINE_SCHEMA_VERSION = 1;

export const MODEL_ALLOWED_OUTPUT_FIELDS = ['scenario', 'subQuestions', 'markScheme'] as const;

// توسيع حالات التوليد لتشمل الحالات القديمة والجديدة لمنع تعارض invariants.ts
export type AssessmentGenerationItemStatus = 
  | 'queued' | 'grounding' | 'generating' | 'normalizing' | 'validating' 
  | 'ready' | 'retry_pending' | 'completed' | 'failed' | 'cancelled' | 'superseded'
  | 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED';

export type AssessmentGenerationRunStatusString = 
  | 'queued' | 'running' | 'reviewing' | 'completed' | 'partial' | 'failed' | 'cancelled' | 'superseded'
  | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface AssessmentGenerationItemSnapshot {
  itemId: string;
  status: AssessmentGenerationItemStatus;
  timestamp: number;
}

export interface AssessmentGenerationRunSnapshot {
  runId: string;
  status: AssessmentGenerationRunStatusString;
  items: AssessmentGenerationItemSnapshot[];
}

export interface AssessmentGenerationRunStatus {
  runId: string;
  status: AssessmentGenerationRunStatusString;
  progress: number;
}

export interface AssessmentGenerationStageTimings {
  blueprintGeneration: number;
  itemGeneration: number;
  validation: number;
}

export interface AssessmentItemSeed {
  seedId: string;
  topic: string;
  curriculum: 'CAMBRIDGE_IGCSE' | 'OMAN_MINISTRY';
}

// ==========================================
// 2. الهيكلة الجديدة (عُمان وكامبريدج) + دعم الملفات القديمة
// ==========================================

export type OmanCognitiveLevel = 'KNOWLEDGE' | 'APPLICATION' | 'REASONING';
export type OmanDifficulty = 'LOW' | 'MEDIUM' | 'HIGH';
export type OmanItemType = 'MULTIPLE_CHOICE' | 'SHORT_ANSWER' | 'LONG_ANSWER' | 'PRACTICAL_INQUIRY';
export type CambridgeCommandVerb = 'State' | 'Describe' | 'Explain' | 'Suggest' | 'Calculate' | 'Determine';

export interface AssessmentBlueprint {
  blueprintId: string;
  version: number;
  scenarios?: AssessmentScenario[];
  
  // الخصائص القديمة المضافة لإرضاء TypeScript
  engineSchemaVersion?: string;
  blueprintVersion?: string;
  draftId?: string;
  programmeId?: string;
  syllabusCode?: string;
  stageLabel?: string;
  generationEpoch?: number;
  itemCount?: number;
  totalMarks?: number;
  items?: any[];
}

export interface AssessmentScenario {
  scenarioId: string;
  topic: string;
  curriculum: 'CAMBRIDGE_IGCSE' | 'OMAN_MINISTRY';
  contextText: string;
  visualRequirement?: ScientificVisual;
  subQuestions: SubQuestion[];
}

export interface AssessmentItemContract {
  itemId: string;
  scenario?: AssessmentScenario;
  subQuestions?: SubQuestion[];
  
  // الخصائص القديمة المضافة لإرضاء TypeScript
  source?: any;
  engineSchemaVersion?: string;
  contractVersion?: string;
  draftId?: string;
}

export interface AssessmentGeneratedItemResult {
  itemId: string;
  status: AssessmentGenerationItemStatus;
  result?: AssessmentItemContract;
  error?: string;
  
  // الخصائص القديمة لإرضاء ملف global-review.ts
  content?: any;
  planItemId?: string;
}

export interface SubQuestion {
  id: string;
  label: 'a' | 'b' | 'c' | 'd';
  itemType: OmanItemType;
  omanCognitiveLevel: OmanCognitiveLevel;
  commandVerb: CambridgeCommandVerb;
  content: string;
  marks: number;
  options?: string[];
  markScheme: ExpertMarkScheme;
}

export interface ExpertMarkScheme {
  correctAnswer: string;
  stepByStepMarks: string[];
  ecfAllowed: boolean;
  alternativeWording: string[];
}

export interface ScientificVisual {
  type: 'CIRCUIT' | 'GRAPH' | 'TABLE' | 'BIOLOGY_CELL' | 'CHEMISTRY_APPARATUS';
  format: 'SVG' | 'MERMAID';
  renderCode: string;
}

// ==========================================
// 3. دوال وهمية (Stubs) لإصلاح أخطاء الاستيراد في الملفات القديمة
// ==========================================
export function buildAssessmentBlueprint(params: any): any { return {}; }
export function buildAssessmentItemContracts(params: any): any[] { return []; }
