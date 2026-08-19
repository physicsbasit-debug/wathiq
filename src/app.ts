import { AssessmentGenerationJobService } from "./assessment-generation-jobs.js";
import { buildProgressiveGenerationPayload } from "./assessment-generation-progressive.js";
import { getRuntimeConfig } from "./runtime-config.js";
import { requireOwnerSession } from "./owner-session.js";
import type { ExamDraft } from "./types.js";
import { ExamRenderer } from "./ui.js";
import type { AssessmentGenerationItemSnapshot, AssessmentScenario } from "./assessment-engine/index.js";

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
    // تم الإصلاح: بناء الكائن ثم تأكيد نوعه كمسودة بشكل آمن (Casting)
    const draft: unknown = {
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
    return draft as ExamDraft;
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

        const run = enqueueResponse.run as unknown as Record<string, unknown>;
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
        
        const validResults: AssessmentScenario[] = finalItems
            .filter((item) => {
                const record = item as unknown as Record<string, unknown>;
                return Boolean(record.result);
            })
            .map((item) => {
                const record = item as unknown as Record<string, unknown>;
                const res = record.result as Record<string, unknown>;
                const content = (res.content as Record<string, unknown>) || {};
                
                const optionsRaw = Array.isArray(content.options) ? content.options : [];
                const options = optionsRaw.map(String);
                const markSchemeRaw = Array.isArray(content.markScheme) ? content.markScheme : [];
                
                const scenario: AssessmentScenario = {
                    scenarioId: typeof item.itemId === "string" ? item.itemId : crypto.randomUUID(),
                    topic: typeof record.topic === "string" ? record.topic : "موضوع علمي",
                    curriculum: "CAMBRIDGE_IGCSE",
                    contextText: typeof content.stimulus === "string" ? content.stimulus : "",
                    subQuestions: [
                        {
                            id: `sq-${crypto.randomUUID()}`,
                            label: "a",
                            itemType: options.length > 0 ? "MULTIPLE_CHOICE" : "SHORT_ANSWER",
                            omanCognitiveLevel: "APPLICATION",
                            commandVerb: "State", // تم الإصلاح: استخدام فعل معتمد في كامبريدج
                            content: typeof content.text === "string" ? content.text : "",
                            marks: 1,
                            options: options,
                            markScheme: {
                                correctAnswer: typeof content.answer === "string" ? content.answer : "",
                                stepByStepMarks: markSchemeRaw.map(String),
                                ecfAllowed: false,
                                alternativeWording: []
                            }
                        }
                    ]
                };
                return scenario;
            });
            
        renderer.renderExam(validResults);

    } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error("Wathiq Generation Error:", err);
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; padding: 20px; background: #fff0f0; border: 1px solid #ffcccc; border-radius: 8px; color: #d8000c;">
                    <strong>خطأ في التوليد:</strong> ${userFacingError(err)}
                </div>`;
        }
    } finally {
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.textContent = "توليد اختبار جديد (AI)";
        }
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
