export type ViewName = "home" | "wizard" | "library" | "policy" | "admin";
export type WizardStep = 1 | 2 | 3 | 4;
export type Difficulty = "سهل" | "متوسط" | "متقدم";
export type QuestionType = "اختيار من متعدد" | "إجابة قصيرة" | "إجابة طويلة";
export type CognitiveLevel = "معرفة" | "تطبيق" | "استدلال";
export type ItemDifficulty = "منخفض" | "متوسط" | "مرتفع";
export type ExamTitleOption = "الاختبار القصير الأول" | "الاختبار القصير الثاني" | "الاختبار النهائي";
export type AssessmentType = "اختبار قصير رسمي" | "امتحان نهاية الفصل الدراسي";
export type QuestionDesignPattern = "مفهومي" | "سياقي" | "حسابي" | "بيانات" | "استقصائي" | "مقارنة";
export type QuestionVisualType = "none" | "line_graph" | "bar_chart" | "pressure_diagram" | "circuit_diagram" | "electrostatic_diagram" | "data_table" | "instrument_scale" | "ray_diagram" | "force_diagram" | "flow_diagram";
export type QuestionVisualVariant = "default" | "submerged_object" | "depth_comparison" | "force_area" | "liquid_column" | "series_circuit" | "measurement_circuit" | "charge_transfer" | "attraction_repulsion" | "electric_field" | "trend" | "comparison" | "multi_series" | "table_completion" | "table_comparison" | "thermometer" | "burette" | "measuring_cylinder" | "meter_scale" | "reflection" | "refraction" | "converging_lens" | "prism" | "free_body" | "balanced_forces" | "moments" | "linear_flow" | "cycle_flow" | "state_change";
export type QuestionVisualRole = "read" | "calculate" | "interpret" | "compare" | "complete" | "draw" | "evaluate";
export type CircuitComponent = "battery" | "switch_open" | "switch_closed" | "lamp" | "resistor" | "ammeter" | "voltmeter";

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

export interface QuestionVisualIllustration {
  url: string;
  assetPath: string;
  mimeType: string;
  model: string;
  generatedAt: string;
  promptVersion: string;
  validated: boolean;
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

export interface LearningOutcome {
  id: string;
  label: string;
}

export interface Lesson {
  id: string;
  label: string;
  outcomes: LearningOutcome[];
}

export interface Unit {
  id: string;
  label: string;
  lessons: Lesson[];
}

export interface SubjectOption {
  id: string;
  label: string;
  grades: number[];
  units: Unit[];
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
  grade: number | null;
  subjectId: string;
  unitId: string;
  lessonIds: string[];
  outcomeIds: string[];
  lessonTopics: string[];
  topic: string;
  sourceReferences: ExamSourceReference[];
  sourceRetrievalVersion: string;
  title: ExamTitleOption;
  examDate: string;
  school: string;
  directorate: string;
  academicYear: string;
  semester: string;
  durationMinutes: number;
  totalMarks: number;
  difficulty: Difficulty;
  trustedEnrichmentEnabled: boolean;
  visualEnhancementEnabled: boolean;
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
  outcomeId: string;
  outcomeLabel: string;
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
  questionForm?: QuestionDesignPattern;
  workingRequired?: boolean;
  sourceSupport?: string;
  enrichmentSupport?: string;
  enrichmentSourceTitle?: string;
  enrichmentSourceUrl?: string;
  needsReview?: boolean;
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

export interface LibraryExam {
  id: string;
  title: string;
  subject: string;
  grade: number;
  status: "مسودة" | "معتمد";
  date: string;
  progress?: number;
  hasModelB?: boolean;
}

export type SourceMode = "file" | "url";
export type SourceSemester = "الفصل الأول" | "الفصل الثاني" | "العام الكامل" | "غير محدد";
export type SourceKind =
  | "كتاب الطالب"
  | "دليل المعلم"
  | "نواتج التعلم"
  | "جدول المواصفات"
  | "اختبار كامبريدج"
  | "مصدر عالمي";
export type SourceStatus = "جاهز للفهرسة" | "مفهرس" | "يحتاج مراجعة" | "مؤرشف";
export type SourceAuthority = "منهج عُماني" | "كامبريدج" | "مصدر عالمي";
export type SourceUploadState = "غير مرفوع" | "قيد الرفع" | "مرفوع" | "فشل الرفع" | "مؤرشف";
export type SourceExtractionStatus = "لم يبدأ" | "جارٍ الاستخراج" | "مكتمل" | "يحتاج OCR" | "فشل";
export type SourceExtractionMethod = "pdf-text" | "google-vision-ocr";

export interface SourceDraft {
  mode: SourceMode;
  title: string;
  kind: SourceKind;
  grade: number | null;
  subjectId: string;
  version: string;
  semester: SourceSemester | "";
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
  version: string;
  semester: SourceSemester;
  fileName?: string;
  url?: string;
  rightsConfirmed: boolean;
  status: SourceStatus;
  drivePath: string;
  createdAt: string;
  updatedAt: string;
  contentFingerprint?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  driveFileId?: string;
  driveParentFolderId?: string;
  driveOriginalParentFolderId?: string;
  driveWebViewLink?: string;
  driveMd5Checksum?: string;
  uploadState?: SourceUploadState;
  uploadedAt?: string;
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

export type SourceStructureNodeType = "وحدة" | "درس" | "موضوع" | "نشاط" | "مراجعة" | "أسئلة";
export type SourceStructureReviewStatus = "مرشح" | "معتمد";

export interface SourceStructureNode {
  id: string;
  sourceId: string;
  parentId: string | null;
  nodeType: SourceStructureNodeType;
  title: string;
  pageStart: number;
  pageEnd: number;
  orderIndex: number;
  confidence: number;
  reviewStatus: SourceStructureReviewStatus;
  extractionMethod: string;
  createdAt: string;
  updatedAt: string;
}

export interface SourceStructureExtractionResult {
  sourceId: string;
  nodes: SourceStructureNode[];
  tocPages: number[];
  usedFallback: boolean;
  reliableTocFound: boolean;
  manualTocRequired: boolean;
  candidateTocPages: number[];
  message: string;
}

export interface SourceStructureExtractionOptions {
  tocPages?: number[];
  allowUnitHeadingFallback?: boolean;
}

export interface SourceStructureValidation {
  valid: boolean;
  issues: string[];
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
