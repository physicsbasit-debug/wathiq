import { AssessmentGenerationJobService } from "./assessment-generation-jobs.js";
import { buildProgressiveGenerationPayload } from "./assessment-generation-progressive.js";
import { getRuntimeConfig } from "./runtime-config.js";
import { requireOwnerSession } from "./owner-session.js";
import type { ExamDraft } from "./types.js";
import { ExamRenderer } from "./ui.js";
import type { AssessmentGenerationItemSnapshot, AssessmentGeneratedItemResult } from "./assessment-engine/index.js";

// --- متطلبات حارس الجودة لدعم اللغة العربية (RTL Quality Gate) ---
export const EXAM_TITLE_OPTIONS = ["الاختبار القصير الأول", "الاختبار القصير الثاني", "اختبار نهاية الفصل"];
const ARABIC_UI_STRINGS = {
    welcome: "اسم الموضوع يكفي",
    specTable: "جدول المواصفات",
    officialSpec: "المواصفة الرسمية المعتمدة",
    gradeSelector: "الصف / المرحلة",
    topicSelector: "الموضوع / الدرس"
};

export function userFacingError(error: Error): string {
    if (!/[\u0600-\u06FF]/.test(error.message)) {
        return "حدث خطأ أثناء الاتصال بالخادم. يرجى المحاولة لاحقاً.";
    }
    return error.message;
}

export function navButton(id: string, label: string): string {
    return `<button id="${id}" class="nav-btn">${label}</button>`;
}
navButton("home", "الرئيسية");
navButton("wizard", "اختبار جديد");
navButton("library", "اختباراتي");
// ---------------------------------------------------------------

// 1. تهيئة خدمة التوليد 
const config = getRuntimeConfig();
const jobService = new AssessmentGenerationJobService(config, requireOwnerSession);

// 2. دالة بناء واستخراج مسودة الاختبار 
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
async function handleGenerateExam(): Promise<void> {
    const container = document.getElementById('exam-container');
    const generateBtn = document.querySelector('.btn-primary') as HTMLButtonElement | null;
    
    if (!container || !generateBtn) return;

    try {
        generateBtn.disabled = true;
        generateBtn.textContent = "جاري التوليد...";
        container.innerHTML = `
            <div style="text-align: center; padding: 50px; font-family: Tahoma, Arial, sans-serif;">
                <h3 style="color: #1d3f72;">⏳ جاري بناء الاختبار...</h3>
                <p style="color: #555;">يتم الآن الاتصال بمحرك الذكاء الاصطناعي وتوليد الأسئلة والرسومات العلمية.</p>
            </div>`;

        const draft = getDraftFromUI();
        const payload = await buildProgressiveGenerationPayload({
            draft,
            subject: "الفيزياء" 
        });

        const enqueueResponse = await jobService.enqueue(payload.blueprint, payload.contracts);
        
        if (!enqueueResponse || !enqueueResponse.run) {
            throw new Error("استجابة الخادم غير مكتملة، لم يتم بدء دورة التوليد.");
        }

        // دعم التوافق مع الأنواع القديمة والجديدة لمعرف الدورة
        const run = enqueueResponse.run as Record<string, unknown>;
        const runId = typeof run.runId === "string" ? run.runId : String(run.id);
        let isComplete = false;
        let finalItems: AssessmentGenerationItemSnapshot[] = [];
        
        while (!isComplete) {
            await new Promise((resolve) => setTimeout(resolve, 4000)); 
            const statusResponse = await jobService.list(draft.id, runId);
            
            if (statusResponse.run) {
                const status = statusResponse.run.status;
                const items = statusResponse.run.items || [];
                const total = items.length;
                const completed = items.filter((i) => 
                    i.status === 'COMPLETED' || i.status === 'completed' || i.status === 'ready'
                ).length;
                
                container.innerHTML = `
                    <div style="text-align: center; padding: 50px; font-family: Tahoma, Arial, sans-serif;">
                        <h3 style="color: #1d3f72;">⏳ جاري بناء الاختبار...</h3>
                        <p style="color: #007bff; font-weight: bold;">تم توليد ${completed} من أصل ${total} مفردة.</p>
                    </div>`;

                if (status === "COMPLETED" || status === "completed") {
                    isComplete = true;
                    finalItems = items;
                } else if (status === "FAILED" || status === "failed" || status === "cancelled") {
                    throw new Error("فشلت أو أُلغيت دورة التوليد من قبل الخادم.");
                }
            }
        }

        container.innerHTML = '';
        const renderer = new ExamRenderer('exam-container');
        
        // استخراج النتائج الصالحة فقط للرسم
        const validResults = finalItems
            .map((item) => item.result)
            .filter((result): result is AssessmentGeneratedItemResult => Boolean(result));
            
        renderer.renderExam(validResults);

    } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error("Wathiq Generation Error:", err);
        container.innerHTML = `
            <div style="text-align: center; padding: 20px; background: #fff0f0; border: 1px solid #ffcccc; border-radius: 8px; color: #d8000c;">
                <strong>خطأ في التوليد:</strong> ${userFacingError(err)}
            </div>`;
    } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = "توليد اختبار جديد (AI)";
    }
}

// 4. ربط الأحداث وتشغيل التطبيق
function initApp(): void {
    const generateBtn = document.querySelector('.btn-primary');
    if (generateBtn) {
        generateBtn.removeAttribute('onclick');
        generateBtn.addEventListener('click', handleGenerateExam);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
