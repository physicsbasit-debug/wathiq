// src/assessment-engine/contracts.ts

// ==========================================
// 1. الأنواع الأساسية لمحرك التقييم (Core Engine Types)
// ==========================================

export type AssessmentEngineErrorCode = 
  | 'INVALID_BLUEPRINT'
  | 'INVALID_ITEM_CONTRACT'
  | 'STALE_PLAN'
  | 'AUTHORIZATION_FAILED'
  | 'MODEL_TIMEOUT'
  | 'MODEL_RATE_LIMITED'
  | 'MODEL_QUOTA_EXHAUSTED'
  | 'MODEL_UNAVAILABLE'
  | 'MODEL_REQUEST_INVALID'
  | 'MODEL_AUTH_FAILED'
  | 'MODEL_NOT_FOUND'
  | 'MODEL_OUTPUT_TRUNCATED'
  | 'MODEL_OUTPUT_BLOCKED'
  | 'MODEL_INVALID_JSON'
  | 'MODEL_INCOMPLETE_CONTENT'
  | 'MODEL_SCIENTIFIC_MISMATCH'
  | 'MODEL_ASSESSMENT_MISMATCH'
  | 'GLOBAL_DUPLICATION'
  | 'CANCELLED_BY_USER'
  | 'SUPERSEDED_BY_NEW_RUN'
  | 'INTERNAL_ERROR';

export type AssessmentEngineRetryClass = 
  | 'none'
  | 'manual_authentication'
  | 'transport_backoff'
  | 'content_once';

export const ASSESSMENT_BLUEPRINT_VERSION = 1;
export const ASSESSMENT_CONTRACT_VERSION = 1;
export const ASSESSMENT_ENGINE_SCHEMA_VERSION = 1;

export const MODEL_ALLOWED_OUTPUT_FIELDS = [
  'scenario',
  'subQuestions',
  'markScheme',
] as const;

export type AssessmentGenerationItemStatus = 
  | 'PENDING'
  | 'GENERATING'
  | 'COMPLETED'
  | 'FAILED';

export interface AssessmentGenerationItemSnapshot {
  itemId: string;
  status: AssessmentGenerationItemStatus;
  timestamp: number;
}

export interface AssessmentGenerationRunSnapshot {
  runId: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  items: AssessmentGenerationItemSnapshot[];
}

export interface AssessmentGenerationRunStatus {
  runId: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
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
// 2. الهيكلة الجديدة (عُمان وكامبريدج)
// ==========================================

export type OmanCognitiveLevel = 'KNOWLEDGE' | 'APPLICATION' | 'REASONING';
export type OmanDifficulty = 'LOW' | 'MEDIUM' | 'HIGH';
export type OmanItemType = 'MULTIPLE_CHOICE' | 'SHORT_ANSWER' | 'LONG_ANSWER' | 'PRACTICAL_INQUIRY';

export type CambridgeCommandVerb = 'State' | 'Describe' | 'Explain' | 'Suggest' | 'Calculate' | 'Determine';

export interface AssessmentBlueprint {
  blueprintId: string;
  version: number;
  scenarios: AssessmentScenario[];
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
  scenario: AssessmentScenario;
  subQuestions: SubQuestion[];
}

export interface AssessmentGeneratedItemResult {
  itemId: string;
  status: AssessmentGenerationItemStatus;
  result?: AssessmentItemContract;
  error?: string;
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
