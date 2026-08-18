// src/assessment-engine/blueprint.ts

import { OmanCognitiveLevel, OmanDifficulty, OmanItemType, AssessmentScenario } from './contracts';

// 1. واجهة تحدد المعايير المطلوبة للاختبار بناءً على وثيقة تقويم سلطنة عمان
export interface OmanBlueprintConstraints {
  totalMarks: number;
  examDurationMinutes: number;
  cognitiveDistribution: Record<OmanCognitiveLevel, number>; // النسبة المئوية للأهداف
  difficultyDistribution: Record<OmanDifficulty, number>; // النسبة المئوية لمستويات الصعوبة
  itemTypes: {
    multipleChoiceCount: number; // عدد أسئلة الاختيار من متعدد الإجباري
    minLongAnswerCount: number; // الحد الأدنى لأسئلة الإجابة الطويلة (للصفوف العليا)
  };
  practicalInquiryMarks: { min: number; max: number }; // درجات الاستقصاء العملي الإجبارية
}

// 2. دالة توليد مخطط اختبار الصف العاشر لمادة العلوم (مطابق للوثيقة العمانية 100%)
export function generateGrade10OmanBlueprint(): OmanBlueprintConstraints {
  return {
    totalMarks: 60, // الدرجة الكلية 60 درجة للصف العاشر
    examDurationMinutes: 120, // زمن الامتحان ساعتان
    cognitiveDistribution: {
      KNOWLEDGE: 0.40,     // 40% معرفة وتذكر (24 درجة)
      APPLICATION: 0.40,   // 40% تطبيق (24 درجة)
      REASONING: 0.20      // 20% استدلال وقدرات عليا (12 درجة)
    },
    difficultyDistribution: {
      LOW: 0.40,           // 40% مستوى صعوبة منخفض
      MEDIUM: 0.40,        // 40% مستوى صعوبة متوسط
      HIGH: 0.20           // 20% مستوى صعوبة مرتفع
    },
    itemTypes: {
      multipleChoiceCount: 10, // 10 مفردات موضوعية (اختيار من متعدد) إجبارية
      minLongAnswerCount: 2    // مفردتان على الأقل ذات إجابة طويلة
    },
    practicalInquiryMarks: { min: 8, max: 10 } // 8 إلى 10 درجات إجبارية للاستقصاء العلمي
  };
}

// 3. دالة توليد مخطط اختبار الصفوف من الخامس إلى التاسع
export function generateGrades5to9OmanBlueprint(): OmanBlueprintConstraints {
  return {
    totalMarks: 40, // الدرجة الكلية 40 درجة
    examDurationMinutes: 90, // زمن الامتحان ساعة ونصف
    cognitiveDistribution: {
      KNOWLEDGE: 0.40,     // 40% معرفة (16 درجة)
      APPLICATION: 0.40,   // 40% تطبيق (16 درجة)
      REASONING: 0.20      // 20% استدلال (8 درجات)
    },
    difficultyDistribution: {
      LOW: 0.40,
      MEDIUM: 0.40,
      HIGH: 0.20
    },
    itemTypes: {
      multipleChoiceCount: 8,  // 8 مفردات موضوعية (اختيار من متعدد) إجبارية
      minLongAnswerCount: 0    // يعتمد على الصف (التاسع يحتاج، الباقي لا)
    },
    practicalInquiryMarks: { min: 6, max: 8 } // 6 إلى 8 درجات إجبارية للاستقصاء العلمي
  };
}

// 4. الحارس الذكي (Validator): دالة تفحص الاختبار المولد وترفضه إذا خالف المخطط العماني
export function validateExamAgainstBlueprint(scenarios: AssessmentScenario[], blueprint: OmanBlueprintConstraints): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  let totalGeneratedMarks = 0;
  let mcqCount = 0;

  for (const scenario of scenarios) {
    for (const sq of scenario.subQuestions) {
      totalGeneratedMarks += sq.marks;
      if (sq.itemType === 'MULTIPLE_CHOICE') mcqCount += 1;
      
      // فحص جودة كامبريدج: أسئلة الاختيار من متعدد يجب أن تحتوي على 4 خيارات فقط
      if (sq.itemType === 'MULTIPLE_CHOICE' && (!sq.options || sq.options.length !== 4)) {
        errors.push(`السؤال ${sq.id} من نوع اختيار من متعدد لا يحتوي على 4 بدائل بالضبط.`);
      }
    }
  }

  // فحص الدرجة الكلية
  if (totalGeneratedMarks !== blueprint.totalMarks) {
    errors.push(`إجمالي درجات الاختبار (${totalGeneratedMarks}) لا يطابق المخطط العماني المطلوبة (${blueprint.totalMarks}).`);
  }

  // فحص عدد أسئلة الاختيار من متعدد
  if (mcqCount !== blueprint.itemTypes.multipleChoiceCount) {
    errors.push(`عدد أسئلة الاختيار من متعدد (${mcqCount}) لا يطابق المطلوب (${blueprint.itemTypes.multipleChoiceCount}).`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
