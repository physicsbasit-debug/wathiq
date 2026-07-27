export type ViewName = "home" | "wizard" | "library" | "admin";
export type WizardStep = 1 | 2 | 3 | 4;
export type Difficulty = "سهل" | "متوسط" | "متقدم";
export type QuestionType = "اختيار من متعدد" | "إجابة قصيرة" | "إجابة طويلة";
export type CognitiveLevel = "معرفة" | "تطبيق" | "استدلال";

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

export interface ExamDraft {
  id: string;
  grade: number | null;
  subjectId: string;
  unitId: string;
  lessonIds: string[];
  outcomeIds: string[];
  title: string;
  examDate: string;
  school: string;
  directorate: string;
  academicYear: string;
  semester: string;
  durationMinutes: number;
  totalMarks: number;
  difficulty: Difficulty;
  counts: QuestionCounts;
  plan: PlanItem[];
  selectedProposalByPlanItem: Record<string, string>;
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
  questionType: QuestionType;
  marks: number;
  proposals: QuestionProposal[];
}

export interface QuestionProposal {
  id: string;
  text: string;
  answer: string;
  rationale?: string;
  visualKind?: "رسم تخطيطي" | "جدول" | "رسم بياني";
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

export interface SourceDraft {
  mode: SourceMode;
  title: string;
  kind: SourceKind;
  grade: number | null;
  subjectId: string;
  version: string;
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
