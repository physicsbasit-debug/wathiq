// src/assessment-engine/contracts.ts

// 1. ثوابت سلطنة عمان (Oman Ministry Constraints)
export type OmanCognitiveLevel = 'KNOWLEDGE' | 'APPLICATION' | 'REASONING';
export type OmanDifficulty = 'LOW' | 'MEDIUM' | 'HIGH';
export type OmanItemType = 'MULTIPLE_CHOICE' | 'SHORT_ANSWER' | 'LONG_ANSWER' | 'PRACTICAL_INQUIRY';

// 2. أفعال أمر كامبريدج (Cambridge Command Words)
export type CambridgeCommandVerb = 'State' | 'Describe' | 'Explain' | 'Suggest' | 'Calculate' | 'Determine';

// 3. الهيكل الجديد للسؤال (Cambridge Multipart Scenario)
// السؤال لم يعد مجرد "سؤال وجواب"، بل سيناريو علمي يتبعه عدة فروع
export interface AssessmentScenario {
  scenarioId: string;
  topic: string;
  curriculum: 'CAMBRIDGE_IGCSE' | 'OMAN_MINISTRY';
  contextText: string; // السياق العلمي أو القصة المعطاة للطالب
  visualRequirement?: ScientificVisual; // طلبات الرسوم والصور الدقيقة
  subQuestions: SubQuestion[]; // الفروع (a, b, c) المتدرجة في الصعوبة
}

export interface SubQuestion {
  id: string;
  label: 'a' | 'b' | 'c' | 'd'; // ترقيم كامبريدج للأسئلة
  itemType: OmanItemType; // نوع السؤال حسب الوثيقة العمانية
  omanCognitiveLevel: OmanCognitiveLevel; // لضمان التوافق مع أوزان التقويم
  commandVerb: CambridgeCommandVerb; // إجبار الـ LLM على أفعال كامبريدج
  content: string; // نص السؤال الفرعي
  marks: number; // الدرجة المخصصة
  options?: string[]; // للأسئلة الموضوعية فقط (يجب أن تكون 4 دائماً)
  markScheme: ExpertMarkScheme; // نموذج التصحيح الشامل
}

// 4. نموذج التصحيح الاحترافي (Mark Scheme)
export interface ExpertMarkScheme {
  correctAnswer: string;
  stepByStepMarks: string[]; // توزيع الدرجات على خطوات الحل
  ecfAllowed: boolean; // السماح بالخطأ المتراكم (Error Carried Forward)
  alternativeWording: string[]; // الكلمات البديلة المقبولة [AW]
}

// 5. محرك الرسوميات العلمية الدقيقة (Vector Graphics)
export interface ScientificVisual {
  type: 'CIRCUIT' | 'GRAPH' | 'TABLE' | 'BIOLOGY_CELL' | 'CHEMISTRY_APPARATUS';
  format: 'SVG' | 'MERMAID'; // يجب أن يعود الرسم ككود لضمان الجودة الفائقة للطباعة
  renderCode: string; // كود الرسم الذي سيتم تحويله لصورة في واجهة المستخدم
}
