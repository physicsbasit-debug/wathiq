export type ViewName = "home" | "wizard" | "library" | "admin";
export type WizardStep = 1 | 2 | 3 | 4;
export type Difficulty = "سهل" | "متوسط" | "متقدم";
export type QuestionType = "اختيار من متعدد" | "إجابة قصيرة" | "إجابة طويلة";
export type CognitiveLevel = "معرفة" | "تطبيق" | "استدلال";
export type ItemDifficulty = "منخفض" | "متوسط" | "مرتفع";
export type ExamTitleOption = "اختبار قصير" | "اختبار تدريبي" | "اختبار شامل";
export type AssessmentType = "اختبار قصير" | "اختبار تدريبي" | "اختبار شامل";
export type AssessmentGenerationMode = "progressive_items_v1";
export type CambridgeProgrammeId = "primary" | "lower_secondary" | "igcse";
export type QuestionVisualType = "none" | "context_scene" | "line_graph" | "bar_chart" | "pressure_diagram" | "circuit_diagram" | "electrostatic_diagram" | "data_table" | "instrument_scale" | "ray_diagram" | "force_diagram" | "flow_diagram";
export type QuestionVisualVariant = "default" | "door_handle" | "playground_seesaw" | "wrench_tool" | "bicycle_brake" | "shopping_trolley" | "school_bag" | "water_tank" | "solar_panel" | "laboratory_setup" | "road_safety" | "submerged_object" | "depth_comparison" | "force_area" | "liquid_column" | "series_circuit" | "measurement_circuit" | "charge_transfer" | "attraction_repulsion" | "electric_field" | "trend" | "comparison" | "multi_series" | "table_completion" | "table_comparison" | "thermometer" | "burette" | "measuring_cylinder" | "meter_scale" | "reflection" | "refraction" | "converging_lens" | "prism" | "free_body" | "balanced_forces" | "moments" | "linear_flow" | "cycle_flow" | "state_change";
export type QuestionVisualRole = "read" | "calculate" | "interpret" | "compare" | "complete" | "draw" | "evaluate";
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
  variant?: QuestionVisualVariant;
  purpose?: string;
  role?: QuestionVisualRole;
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

export interface ExamSourceReference {
  id: string;
  sourceId: string;
  sourceTitle: string;
  sourceKind: SourceKind;
  pageFrom: number;
  pageTo: number;
  excerpt: string;
  context?: string;
  lessonTopic?: string;
  score: number;
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
  sourceReferences: ExamSourceReference[];
  sourceRetrievalVersion: string;
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
  questionType: QuestionType;
  marks: number;
  proposals: QuestionProposal[];
  visual?: QuestionVisualSpec;
  sourceReferenceId?: string;
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
  sourceSupport?: string;
}

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface SpecValidation {
  valid: boolean;
  issues: ValidationIssue[];
  computedMarks: number;
  suggestedCounts?: QuestionCounts;
}

export type SourceMode = "file" | "url";
export type SourceKind =
  | "كتاب الطالب"
  | "دليل المعلم"
  | "نواتج التعلم"
  | "جدول المواصفات"
  | "اختبار كامبريدج"
  | "مصدر عالمي";
export type SourceStatus = "جاهز للفهرسة" | "مفهرس" | "يحتاج مراجعة" | "مؤرشف";
export type SourceAuthority = "مصدر مرفوع" | "كامبريدج" | "مصدر عالمي";
export type SourceExtractionStatus = "لم يبدأ" | "جارٍ الاستخراج" | "مكتمل" | "يحتاج OCR" | "فشل";
export type SourceExtractionMethod = "pdf-text" | "google-vision-ocr" | "gemini-ocr";

export interface SourceDraft {
  mode: SourceMode;
  title: string;
  kind: SourceKind;
  grade: number | null;
  subjectId: string;
  fileName: string;
  url: string;
  rightsConfirmed: boolean;
}

export interface ManagedSource {
  id: string;
  catalogCode: string;
  fingerprint: string;
  authority: SourceAuthority;
  title: string;
  kind: SourceKind;
  mode: SourceMode;
  grade: number;
  subjectId: string;
  fileName?: string;
  url?: string;
  rightsConfirmed: boolean;
  status: SourceStatus;
  catalogPath: string;
  createdAt: string;
  updatedAt: string;
  contentFingerprint?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  extractionStatus?: SourceExtractionStatus;
  extractionMessage?: string;
  extractedPageCount?: number;
  extractedCharacterCount?: number;
  extractedLanguage?: string;
  extractionPreview?: string;
  detectedHeadings?: string[];
  extractedAt?: string;
  extractionVersion?: string;
}

export interface SourceOcrPage {
  pageNumber: number;
  content: string;
  characterCount: number;
  confidence: number | null;
  provider: string;
  processedAt: string;
}

export interface SourceOcrLayoutWord {
  text: string;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  confidence: number | null;
}

export interface SourceOcrLayoutPage {
  pageNumber: number;
  width: number;
  height: number;
  words: SourceOcrLayoutWord[];
  provider: string;
  processedAt: string;
}

export interface SourceTextChunk {
  chunkIndex: number;
  pageFrom: number;
  pageTo: number;
  content: string;
  characterCount: number;
}

export type SourceExtractionQualityReason = "accepted" | "insufficient_text" | "garbled_arabic";

export interface SourceExtractionQuality {
  accepted: boolean;
  score: number;
  reason: SourceExtractionQualityReason;
  message: string;
  arabicLetterCount: number;
  wordCount: number;
  commonWordRatio: number;
  averageWordLength: number;
  longWordRatio: number;
  singleLetterWordRatio: number;
  topFiveLetterShare: number;
  qualityGateVersion: string;
}

export interface SourceExtractionResult {
  method: SourceExtractionMethod;
  pageCount: number;
  characterCount: number;
  nonEmptyPageCount: number;
  language: string;
  preview: string;
  detectedHeadings: string[];
  requiresOcr: boolean;
  quality: SourceExtractionQuality;
  chunks: SourceTextChunk[];
}

export interface SourceValidationIssue {
  field: keyof SourceDraft | "general";
  message: string;
}

export interface SourceValidation {
  valid: boolean;
  issues: SourceValidationIssue[];
}

export interface SourceRegistryBackup {
  schemaVersion: 1;
  product: "واثق";
  exportedAt: string;
  sources: ManagedSource[];
}

export interface SourceImportResult {
  valid: boolean;
  sources: ManagedSource[];
  issues: string[];
}

export interface SourceMergeResult {
  sources: ManagedSource[];
  addedCount: number;
  skippedCount: number;
}
