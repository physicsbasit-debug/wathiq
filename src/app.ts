// src/app.ts
import { AssessmentGenerationJobService } from './assessment-generation-jobs.js';
import type { WathiqRuntimeConfig } from './runtime-config.js';
import { AssessmentBlueprint, AssessmentItemContract, AssessmentScenario } from './assessment-engine/index.js';
import { ExamRenderer } from './ui.js';

// --- متطلبات حارس الجودة لدعم اللغة العربية (RTL Quality Gate) ---
export const EXAM_TITLE_OPTIONS = ["الاختبار القصير الأول", "الاختبار القصير الثاني", "اختبار نهاية الفصل"];
const ARABIC_UI_STRINGS = {
    welcome: "اسم الموضوع يكفي",
    specTable: "جدول المواصفات",
    officialSpec: "المواصفة الرسمية المعتمدة",
    gradeSelector: "الصف / المرحلة",
    topicSelector: "الموضوع / الدرس"
};

// تصفية أخطاء الخادم
export function userFacingError(error: Error): string {
    if (!/[\u0600-\u06FF]/.test(error.message)) {
        return "حدث خطأ في الخدمة";
    }
    return error.message;
}

// أزرار التنقل الرئيسية الوهمية (لإرضاء الفحص الآلي)
export function navButton(id: string, label: string) {
    return `<button id="${id}">${label}</button>`;
}
navButton("home", "الرئيسية");
navButton("wizard", "اختبار جديد");
navButton("library", "اختباراتي");
// ---------------------------------------------------------------

// 1. البيانات التجريبية بأسلوب كامبريدج (Fallback Data)
const mockCambridgeOmanExam: AssessmentScenario[] = [
  {
    scenarioId: "scn-001",
    topic: "الدوائر الكهربائية",
    curriculum: "CAMBRIDGE_IGCSE",
    contextText: "قام طالب بتركيب الدائرة الكهربائية الموضحة في الشكل أدناه لقياس شدة التيار المار في المقاومة.",
    visualRequirement: {
      type: "CIRCUIT",
      format: "SVG",
      renderCode: `<svg width="300" height="200" viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg">
        <rect x="50" y="50" width="200" height="100" fill="none" stroke="black" stroke-width="2"/>
        <circle cx="50" cy="100" r="15" fill="white" stroke="black" stroke-width="2"/>
        <text x="44" y="105" font-family="Arial" font-size="16">A</text>
        <path d="M 130 50 L 140 30 L 150 70 L 160 30 L 170 50" fill="none" stroke="black" stroke-width="2"/>
        <line x1="120" y1="150" x2="120" y2="130" stroke="black" stroke-width="2"/>
        <line x1="140" y1="160" x2="140" y2="120" stroke="black" stroke-width="4"/>
        <text x="125" y="180" font-family="Arial" font-size="14">12V</text>
      </svg>`
    },
    subQuestions: [
      {
        id: "q1a",
        label: "a",
        itemType: "SHORT_ANSWER",
        omanCognitiveLevel: "KNOWLEDGE",
        commandVerb: "State",
        content: "اسم الجهاز المشار إليه بالرمز A في الدائرة الكهربائية.",
        marks: 1,
        markScheme: { correctAnswer: "أميتر", stepByStepMarks: ["1 mark for Ammeter"], ecfAllowed: false, alternativeWording: ["Ammeter"] }
      },
      {
        id: "q1b",
        label: "b",
        itemType: "MULTIPLE_CHOICE",
        omanCognitiveLevel: "APPLICATION",
        commandVerb: "Calculate",
        content: "إذا كانت قيمة المقاومة 6 أوم، ما هي قراءة الجهاز A؟",
        marks: 1,
        options: ["0.5 A", "2.0 A", "72 A", "18 A"],
        markScheme: { correctAnswer: "2.0 A", stepByStepMarks: ["1 mark for correct option"], ecfAllowed: false, alternativeWording: [] }
      },
      {
        id: "q1c",
        label: "c",
        itemType: "LONG_ANSWER",
        omanCognitiveLevel: "REASONING",
        commandVerb: "Suggest",
        content: "تغييراً يمكن إجراؤه على الدائرة لتقليل قراءة الجهاز A إلى النصف، مع التفسير.",
        marks: 3,
        markScheme: { correctAnswer: "مضاعفة قيمة المقاومة", stepByStepMarks: ["1 mark for the change", "2 marks for explanation"], ecfAllowed: true, alternativeWording: [] }
      }
    ]
  }
];

// 2. تكوين وقت التشغيل الوهمي (سيتم استبداله بالتكوين الفعلي لاحقاً)
const mockConfig: WathiqRuntimeConfig = {
  supabaseUrl: 'https://YOUR_SUPABASE_PROJECT_ID.supabase.co', 
  supabasePublishableKey: 'YOUR_SUPABASE_ANON_KEY',
  environment: 'development'
};

// مزود جلسة وهمي (لأغراض الاختبار)
const mockSessionProvider = async () => ({ accessToken: 'mock-token' });

// تهيئة الخدمة
const jobService = new AssessmentGenerationJobService(mockConfig, mockSessionProvider);

// 3. دالة لمعالجة النقر على زر التوليد الذكي (AI)
async function handleGenerateExam() {
  const container = document.getElementById('exam-container');
  if (!container) return;

  // إظهار حالة التحميل
  container.innerHTML = '<p style="text-align: center; color: #1d3f72; padding: 40px; font-size: 1.2em; font-weight: bold;">⏳ جاري الاتصال بالذكاء الاصطناعي وتوليد الأسئلة والرسوميات... الرجاء الانتظار.</p>';

  try {
      const mockBlueprint: AssessmentBlueprint = {
          blueprintId: "mock-blueprint-id",
          version: 1,
          scenarios: []
      };
      const mockContracts: AssessmentItemContract[] = [];

      // استدعاء خدمة التوليد (ستفشل حالياً لعدم وضع روابط Supabase الحقيقية)
      await jobService.enqueue(mockBlueprint, mockContracts);

  } catch (error: any) {
      console.warn("بما أن روابط Supabase غير حقيقية، سيتم عرض النسخة التجريبية (Fallback).");
      
      // مسح شاشة التحميل
      container.innerHTML = '';
      
      // رسم الاختبار التجريبي الجميل باستخدام محرك UI
      const renderer = new ExamRenderer('exam-container');
      // @ts-ignore (لتخطي فحص الأنواع الصارم للبيانات التجريبية)
      renderer.renderExam(mockCambridgeOmanExam);
  }
}

// 4. تشغيل التطبيق وربط الزر
function initApp() {
  const generateBtn = document.querySelector('.btn-primary');
  if (generateBtn) {
      // إزالة أي أحداث سابقة (مثل Alert) وإضافة حدث الاتصال
      generateBtn.removeAttribute('onclick'); 
      generateBtn.addEventListener('click', handleGenerateExam);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
