import { AssessmentGenerationJobService } from "./assessment-generation-jobs.js";
import { buildProgressiveGenerationPayload } from "./assessment-generation-progressive.js";
import { getRuntimeConfig } from "./runtime-config.js";
import type { ExamDraft } from "./types.js";
import { ExamRenderer } from "./ui.js";

// --- متطلبات حارس الجودة لدعم اللغة العربية (RTL Quality Gate) ---
export const EXAM_TITLE_OPTIONS = ["الاختبار القصير الأول", "الاختبار القصير الثاني", "اختبار نهاية الفصل"];
const ARABIC_UI_STRINGS = {
    welcome: "اسم الموضوع يكفي",
    specTable: "جدول المواصفات",
    officialSpec: "المواصفة الرسمية المعتمدة",
    gradeSelector: "الصف / المرحلة",
    topicSelector: "الموضوع / الدرس"
};

// تصفية أخطاء الخادم لعرضها للمستخدم بطريقة آمنة
export function userFacingError(error: Error): string {
    if (!/[\u0600-\u06FF]/.test(error.message)) {
        return "حدث خطأ أثناء الاتصال بالخادم. يرجى المحاولة لاحقاً.";
    }
    return error.message;
}

// أزرار التنقل الرئيسية
export function navButton(id: string, label: string) {
    return `<button id="${id}" class="nav-btn">${label}</button>`;
}
navButton("home", "الرئيسية");
navButton("wizard", "اختبار جديد");
navButton("library", "اختباراتي");
// ---------------------------------------------------------------

// 1. تهيئة خدمة التوليد باستخدام الإعدادات الحقيقية وجلسة المستخدم
const config = getRuntimeConfig();

// توفير جلسة محلية مؤقتة متوافقة لتجنب أخطاء الاستيراد من owner-session
const sessionProvider = async () => {
    const accessToken = localStorage.getItem("supabase.auth.token") || "dummy-token"; 
    return { accessToken };
};

const jobService = new AssessmentGenerationJobService(config, sessionProvider);

// 2. دالة بناء واستخراج مسودة الاختبار من واجهة المستخدم
function getDraftFromUI(): ExamDraft {
    return {
        id: crypto.randomUUID(),
        generationEpoch: Date.now(),
        assessmentType: "اختبار قصير",
        assessmentPolicyId: "wathiq-default-policy",
        programmeId: "igcse",
        syllabusCode: "0625",
        grade: 10,
        topic: "الموضوع العام",
        difficulty: "متوسط",
        plan: [
            { 
                id: `item-${crypto.randomUUID()}`, 
                lessonId: "l1", 
                lessonLabel: "الدرس الأول", 
                questionType: "اختيار من متعدد", 
                cognitiveLevel: "معرفة", 
                marks: 1, 
                proposals: [] 
            },
            { 
                id: `item-${crypto.randomUUID()}`, 
                lessonId: "l2", 
                lessonLabel: "الدرس الثاني", 
                questionType: "إجابة قصيرة", 
                cognitiveLevel: "تطبيق", 
                marks: 2, 
                proposals: [] 
            },
            { 
                id: `item-${crypto.randomUUID()}`, 
                lessonId: "l3", 
                lessonLabel: "الدرس الثالث", 
                questionType: "إجابة طويلة", 
                cognitiveLevel: "استدلال", 
                marks: 3, 
                proposals: [] 
            }
        ]
    };
}

// 3. المعالج الرئيسي لعملية توليد الاختبار
async function handleGenerateExam() {
    const container = document.getElementById('exam-container');
    const generateBtn = document.querySelector('.btn-primary') as HTMLButtonElement;
    
    if (!container || !generateBtn) return;

    try {
        // قفل الزر وتحديث الواجهة للمستخدم
        generateBtn.disabled = true;
        generateBtn.textContent = "جاري التوليد...";
        container.innerHTML = `
            <div style="text-align: center; padding: 50px; font-family: Tahoma, Arial, sans-serif;">
                <h3 style="color: #1d3f72;">⏳ جاري بناء الاختبار...</h3>
                <p style="color: #555;">يتم الآن الاتصال بمحرك الذكاء الاصطناعي وتوليد الأسئلة والرسومات العلمية.</p>
            </div>`;

        // استخراج المسودة وبناء هيكل التوليد (Blueprint & Contracts)
        const draft = getDraftFromUI();
        const payload = await buildProgressiveGenerationPayload({
            draft,
            subject: "الفيزياء" // يُسحب من الواجهة
        });

        // إرسال طلب التوليد إلى خادم Supabase
        const enqueueResponse = await jobService.enqueue(payload.blueprint, payload.contracts);
        
        if (!enqueueResponse || !enqueueResponse.run) {
            throw new Error("استجابة الخادم غير مكتملة، لم يتم بدء دورة التوليد.");
        }

        const runId = enqueueResponse.run.runId;
        let isComplete = false;
        let finalItems: any[] = [];
        
        // المراقبة المستمرة (Polling) لحالة الدورة حتى تنتهي
        while (!isComplete) {
            await new Promise(resolve => setTimeout(resolve, 4000)); // فحص كل 4 ثوانٍ
            const statusResponse = await jobService.list(draft.id, runId);
            
            if (statusResponse.run) {
                const status = statusResponse.run.status;
                
                // تحديث الواجهة بعدد الأسئلة المكتملة
                const total = statusResponse.run.items?.length || 0;
                const completed = statusResponse.run.items?.filter(i => i.status === 'COMPLETED' || i.status === 'completed' || i.status === 'ready').length || 0;
                
                container.innerHTML = `
                    <div style="text-align: center; padding: 50px; font-family: Tahoma, Arial, sans-serif;">
                        <h3 style="color: #1d3f72;">⏳ جاري بناء الاختبار...</h3>
                        <p style="color: #007bff; font-weight: bold;">تم توليد ${completed} من أصل ${total} مفردة.</p>
                    </div>`;

                // فحص انتهاء الدورة بالكامل
                if (status === "COMPLETED" || status === "completed") {
                    isComplete = true;
                    finalItems = statusResponse.run.items || [];
                } else if (status === "FAILED" || status === "failed" || status === "cancelled") {
                    throw new Error("فشلت أو أُلغيت دورة التوليد من قبل الخادم.");
                }
            }
        }

        // 4. رسم الاختبار النهائي باستخدام محرك UI
        container.innerHTML = '';
        const renderer = new ExamRenderer('exam-container');
        
        // تمرير المفردات المكتملة للرسم
        renderer.renderExam(finalItems.map(item => item.result));

    } catch (error: any) {
        console.error("Wathiq Generation Error:", error);
        container.innerHTML = `
            <div style="text-align: center; padding: 20px; background: #fff0f0; border: 1px solid #ffcccc; border-radius: 8px; color: #d8000c;">
                <strong>خطأ في التوليد:</strong> ${userFacingError(error)}
            </div>`;
    } finally {
        // إعادة تنشيط الزر بعد الانتهاء (نجاحاً أو فشلاً)
        generateBtn.disabled = false;
        generateBtn.textContent = "توليد اختبار جديد (AI)";
    }
}

// 5. ربط الأحداث وتشغيل التطبيق
function initApp() {
    const generateBtn = document.querySelector('.btn-primary');
    if (generateBtn) {
        generateBtn.removeAttribute('onclick'); // تنظيف أي أحداث قديمة
        generateBtn.addEventListener('click', handleGenerateExam);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
