// src/assessment-generation-orchestrator.ts

import { generateGrade10OmanBlueprint, generateGrades5to9OmanBlueprint, validateExamAgainstBlueprint } from './assessment-engine/blueprint';
import { AssessmentScenario } from './assessment-engine/contracts';

export class ExamGenerationOrchestrator {
  
  // 1. دالة لتحديد المخطط المناسب بناءً على الصف الدراسي
  static getBlueprintForGrade(grade: number) {
    if (grade === 10) {
      return generateGrade10OmanBlueprint();
    } else if (grade >= 5 && grade <= 9) {
      return generateGrades5to9OmanBlueprint();
    }
    throw new Error("الصف غير مدعوم. النظام مصمم ليدعم الصفوف من 5 إلى 10 فقط وفق الوثيقة العمانية.");
  }

  // 2. دالة تحضير "الطلب الذكي" الذي سيتم إرساله للذكاء الاصطناعي (Supabase Edge Function)
  static prepareGenerationPayload(subject: string, grade: number, topic: string) {
    const blueprint = this.getBlueprintForGrade(grade);
    
    return {
      subject,
      grade,
      topic,
      blueprintConstraints: blueprint,
      generationMode: 'CAMBRIDGE_SCENARIO_BASED', // إجبار النظام على نمط السيناريوهات المركبة لكامبريدج
      
      // التوجيه الأساسي للذكاء الاصطناعي لدمج كامبريدج مع عمان
      systemInstructions: `
        أنت ممتحن أول خبير (Chief Examiner) لمناهج كامبريدج IGCSE في سلطنة عمان.
        مهمتك توليد أسئلة امتحانية لمادة ${subject} للصف ${grade}.
        
        القواعد الذهبية:
        1. لا تولد أسئلة مفردة معزولة. قم بتوليد "سيناريو علمي" (مثلاً تجربة في المختبر) يتبعه فروع (a, b, c).
        2. استخدم أفعال كامبريدج حصراً (State, Describe, Explain, Calculate, Suggest).
        3. تدرج في الصعوبة في فروع السيناريو الواحد: المعرفة (التذكر) -> التطبيق -> الاستدلال (الاستنتاج).
        4. في أسئلة الاختيار من متعدد، يجب أن توفر 4 بدائل دقيقة. المشتتات (الخيارات الخاطئة) يجب أن تكون مقنعة وتمنع استخدام صيغ (جميع ما سبق، لا شيء مما سبق).
        5. التزم التزاماً حرفياً بالأوزان المرسلة لك في مخطط (blueprintConstraints).
      `
    };
  }

  // 3. دالة فحص الاختبار بعد عودته من الذكاء الاصطناعي وقبل حفظه ليعرض للمستخدم
  static validateGeneratedExam(generatedScenarios: AssessmentScenario[], grade: number) {
    const blueprint = this.getBlueprintForGrade(grade);
    
    // استخدام "الحارس الذكي" لفحص الاختبار
    const validationResult = validateExamAgainstBlueprint(generatedScenarios, blueprint);
    
    if (!validationResult.isValid) {
      console.error("تم رفض الاختبار المولد لأنه خالف معايير سلطنة عمان وكامبريدج:", validationResult.errors);
      // في النظام الحقيقي، هنا نقوم بإرسال أمر إعادة المحاولة (Retry) للذكاء الاصطناعي
      throw new Error(`فشل الفحص الأكاديمي: ${validationResult.errors.join(' | ')}`);
    }
    
    console.log("نجاح! الاختبار مطابق 100% لمعايير كامبريدج ووثيقة تقويم سلطنة عمان.");
    return true;
  }
}
