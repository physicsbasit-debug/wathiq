export type ViewName = "home" | "wizard" | "library";
export type WizardStep = 1 | 2 | 3 | 4;
export type Difficulty = "سهل" | "متوسط" | "متقدم";
export type QuestionType = "اختيار من متعدد" | "إجابة قصيرة" | "إجابة طويلة";
export type CognitiveLevel = "معرفة" | "تطبيق" | "استدلال";
export type ItemDifficulty = "منخفض" | "متوسط" | "مرتفع";
export type ExamTitleOption = "الاختبار القصير الأول" | "الاختبار القصير الثاني" | "الاختبار النهائي";
export type AssessmentType = "اختبار قصير" | "اختبار نهائي";
export type AssessmentGenerationMode = "progressive_items_v1";
export type CambridgeProgrammeId = "primary" | "lower_secondary" | "igcse";
export type QuestionVisualType = "none" | "context_scene" | "line_graph" | "bar_chart" | "pressure_diagram" | "circuit_diagram" | "electrostatic_diagram" | "data_table" | "instrument_scale" | "ray_diagram" | "force_diagram" | "flow_diagram";
export type CircuitComponent = "battery" | "switch_open" | "switch_closed" | "lamp" | "resistor" | "motor" | "ammeter" | "voltmeter";

export interface QuestionVisualPoint {
  x: number;
  y: number;
  label: string;
}

export interface QuestionVisualSeries {
  label: string;
  points: QuestionVisualPoint[];
}

export interface QuestionVisualVector {
  label: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  magnitude: number;
  unit?: string;
}


export interface QuestionVisualAnchor {
  kind: "pivot" | "point" | "support" | "object";
  label: string;
  x: number;
  y: number;
}

export interface QuestionVisualSegment {
  kind: "rod" | "surface" | "path";
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface QuestionVisualDimension {
  label: string;
  value: number;
  unit: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type QuestionVisualIllustrationAssetKind = "scene_2d";
export type QuestionVisualIllustrationRenderMode = "replace";

export interface QuestionVisualIllustration {
  url: string;
  assetPath: string;
  mimeType: string;
  model: string;
  generatedAt: string;
  promptVersion: string;
  validated: boolean;
  assetKind?: QuestionVisualIllustrationAssetKind;
  renderMode?: QuestionVisualIllustrationRenderMode;
}


export type VisualJobStatus = "queued" | "generating" | "validating" | "ready" | "retry_pending" | "failed" | "cancelled";
export type VisualJobRequiredMode = "replace";

export interface QuestionVisualJobSnapshot {
  id: string;
  draftId: string;
  planItemId: string;
  visualHash: string;
  requiredMode: VisualJobRequiredMode;
  status: VisualJobStatus;
  attemptCount: number;
  maxAttempts: number;
  errorCode: string;
  errorMessage: string;
  asset?: QuestionVisualIllustration;
  startedAt: string;
  completedAt: string;
  updatedAt: string;
}

export interface QuestionVisualSpec {
  type: QuestionVisualType;
  visualId?: string;
  purpose?: string;
  title: string;
  altText: string;
  xAxisLabel: string;
  xAxisUnit: string;
  yAxisLabel: string;
  yAxisUnit: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  points: QuestionVisualPoint[];
  series: QuestionVisualSeries[];
  labels: string[];
  values: number[];
  components: CircuitComponent[];
  annotations: string[];
  tableColumns: string[];
  tableRows: string[];
  tableCells: string[][];
  hiddenCells: string[];
  vectors: QuestionVisualVector[];
  anchors: QuestionVisualAnchor[];
  segments: QuestionVisualSegment[];
  dimensions: QuestionVisualDimension[];
  illustration?: QuestionVisualIllustration;
}


export interface SubjectOption {
  id: string;
  label: string;
  programmes: CambridgeProgrammeId[];
}

export interface QuestionCounts {
  mcq: number;
  short: number;
  long: number;
}

export interface ExamDraft {
  id: string;
  assessmentType: AssessmentType;
  assessmentPolicyId: string;
  programmeId: CambridgeProgrammeId;
  syllabusCode: string;
  grade: number | null;
  subjectId: string;
  lessonTopics: string[];
  topic: string;
  title: ExamTitleOption;
  examDate: string;
  school: string;
  academicYear: string;
  durationMinutes: number;
  totalMarks: number;
  difficulty: Difficulty;
  visualJobs: Record<string, QuestionVisualJobSnapshot>;
  generationMode: AssessmentGenerationMode;
  generationRunId: string;
  generationEpoch: number;
  counts: QuestionCounts;
  plan: PlanItem[];
  selectedProposalByPlanItem: Record<string, string>;
  generationVersion: string;
  generationModel: string;
  generatedAt: string;
  approvedAt: string;
  currentStep: WizardStep;
  updatedAt: string;
  status: "مسودة" | "جاهز للمراجعة" | "معتمد";
}

export interface PlanItem {
  id: string;
  lessonId: string;
  lessonLabel: string;
  cognitiveLevel: CognitiveLevel;
  difficultyLevel?: ItemDifficulty;
  assessmentFocus?: "استقصاء علمي";
  questionType: QuestionType;
  marks: number;
  proposals: QuestionProposal[];
  visual?: QuestionVisualSpec;
}

export interface QuestionProposal {
  id: string;
  stimulus?: string;
  text: string;
  options?: string[];
  answer: string;
  rationale?: string;
  markScheme?: string[];
  workingRequired?: boolean;
  reviewSupport?: string;
}

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface SpecValidation {
  valid: boolean;
  issues: ValidationIssue[];
  computedMarks: number;
}
