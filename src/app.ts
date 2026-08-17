// src/app.ts

import { ExamRenderer } from './ui';
import { AssessmentScenario } from './assessment-engine/contracts';

// 1. إنشاء بيانات امتحان تجريبي (Mock Data) لنختبر جودة العرض والرسوميات
// هذا بالضبط ما سيعود لك من الذكاء الاصطناعي (Supabase) لاحقاً
const mockCambridgeOmanExam: AssessmentScenario[] = [
  {
    scenarioId: "scn-001",
    topic: "الدوائر الكهربائية",
    curriculum: "CAMBRIDGE_IGCSE",
    contextText: "قام طالب بتركيب الدائرة الكهربائية الموضحة في الشكل أدناه لقياس شدة التيار المار في المقاومة.",
    visualRequirement: {
      type: "CIRCUIT",
      format: "SVG",
      // كود SVG دقيق لتوليد رسمة دائرة كهربائية بجودة كامبريدج
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
        options: ["0.5 A", "2.0 A", "72 A", "18 A"], // 4 خيارات مطابقة للوثيقة العمانية
        markScheme: { correctAnswer: "2.0 A", stepByStepMarks: ["1 mark for correct option"], ecfAllowed: false, alternativeWording: [] }
      },
      {
        id: "q1c",
        label: "c",
        itemType: "LONG_ANSWER",
        omanCognitiveLevel: "REASONING", // يقيس الاستدلال (تفكير عليا)
        commandVerb: "Suggest",
        content: "تغييراً يمكن إجراؤه على الدائرة لتقليل قراءة الجهاز A إلى النصف، مع التفسير.",
        marks: 3,
        markScheme: { correctAnswer: "مضاعفة قيمة المقاومة", stepByStepMarks: ["1 mark for the change", "2 marks for explanation"], ecfAllowed: true, alternativeWording: [] }
      }
    ]
  }
];

// 2. تشغيل الواجهة بمجرد تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  try {
    const renderer = new ExamRenderer('exam-container');
    renderer.renderExam(mockCambridgeOmanExam);
    console.log("تم بنجاح رسم الاختبار التجريبي بأسلوب كامبريدج!");
  } catch (error) {
    console.error("خطأ أثناء تشغيل الواجهة:", error);
  }
});
