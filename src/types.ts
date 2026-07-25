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
