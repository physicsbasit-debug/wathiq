import { SCIENCE_ASSESSMENT_POLICY_ID } from "./assessment-policy.js";
import { parseQuestionVisualSpec } from "./question-visual.js";
export const SOURCE_GENERATION_VERSION = "source-grounded-policy-ai-10-strict-lesson-scope";
export const GENERATION_BATCH_SIZE = 2;
const browserFetch = (input, init) => globalThis.fetch(input, init);
function asRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value
        : null;
}
function errorMessage(payload, fallback) {
    const record = asRecord(payload);
    if (!record)
        return fallback;
    let message = fallback;
    for (const key of ["error", "message", "detail"]) {
        if (typeof record[key] === "string" && record[key]) {
            message = record[key];
            break;
        }
    }
    const requestId = typeof record.requestId === "string" ? record.requestId.trim() : "";
    return requestId ? `${message} رمز التتبع: ${requestId}` : message;
}
const QUESTION_DESIGN_PATTERNS = [
    "مفهومي", "سياقي", "حسابي", "بيانات", "استقصائي", "مقارنة",
];
function isQuestionDesignPattern(value) {
    return typeof value === "string" && QUESTION_DESIGN_PATTERNS.includes(value);
}
function parseAlternative(value, expected) {
    const record = asRecord(value);
    if (!record)
        throw new Error("استجابة مولد الأسئلة تحتوي بديلًا غير صالح.");
    const stimulus = typeof record.stimulus === "string" ? record.stimulus.trim() : "";
    const text = typeof record.text === "string" ? record.text.trim() : "";
    const options = Array.isArray(record.options)
        ? record.options.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean)
        : [];
    const answer = typeof record.answer === "string" ? record.answer.trim() : "";
    const rationale = typeof record.rationale === "string" ? record.rationale.trim() : "";
    const markScheme = Array.isArray(record.markScheme)
        ? record.markScheme.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean)
        : [];
    const questionForm = isQuestionDesignPattern(record.questionForm) ? record.questionForm : null;
    const workingRequired = record.workingRequired === true;
    const sourceSupport = typeof record.sourceSupport === "string" ? record.sourceSupport.trim() : "";
    const needsReview = record.needsReview === true;
    if (!text || !answer || !rationale || !sourceSupport || !questionForm) {
        throw new Error("استجابة مولد الأسئلة ناقصة ولا تصلح للعرض.");
    }
    if (questionForm !== expected.styleTarget) {
        throw new Error("مولد الأسئلة لم يلتزم بنمط السؤال المحدد في الخطة.");
    }
    if (markScheme.length !== expected.marks) {
        throw new Error("نموذج التصحيح لا يوزع نقطة واضحة لكل درجة.");
    }
    if (["سياقي", "حسابي", "بيانات", "استقصائي"].includes(questionForm) && !stimulus) {
        throw new Error("أحد الأسئلة السياقية لا يحتوي متنًا أو بيانات كافية.");
    }
    if (questionForm === "حسابي" && !workingRequired) {
        throw new Error("السؤال الحسابي لا يطلب إظهار خطوات الحل.");
    }
    if (expected.questionType === "اختيار من متعدد") {
        if (options.length !== 4 || new Set(options).size !== 4) {
            throw new Error("أحد أسئلة الاختيار من متعدد لا يحتوي أربعة بدائل مختلفة.");
        }
        if (!options.includes(answer)) {
            throw new Error("الإجابة الصحيحة لا تطابق أحد بدائل سؤال الاختيار من متعدد.");
        }
    }
    else if (options.length !== 0) {
        throw new Error("سؤال غير موضوعي أعاد بدائل اختيار من متعدد على نحو غير صالح.");
    }
    return { stimulus, text, options, answer, rationale, markScheme, questionForm, workingRequired, sourceSupport, needsReview };
}
export function parseQuestionGenerationResponse(payload, requestedItems) {
    const record = asRecord(payload);
    if (!record || !Array.isArray(record.items)) {
        throw new Error("استجابة مولد الأسئلة غير صالحة.");
    }
    const expectedById = new Map(requestedItems.map((item) => [item.planItemId, item]));
    const seen = new Set();
    const items = record.items.map((rawItem) => {
        const itemRecord = asRecord(rawItem);
        const planItemId = typeof itemRecord?.planItemId === "string" ? itemRecord.planItemId : "";
        const expected = expectedById.get(planItemId);
        if (!expected || seen.has(planItemId) || !Array.isArray(itemRecord?.alternatives)) {
            throw new Error("مولد الأسئلة أعاد مفردة مجهولة أو مكررة.");
        }
        seen.add(planItemId);
        if (itemRecord.alternatives.length !== 3) {
            throw new Error("يجب أن يعيد مولد الأسئلة ثلاثة بدائل لكل مفردة.");
        }
        return {
            planItemId,
            visual: parseQuestionVisualSpec(itemRecord.visual, expected.visualTarget),
            alternatives: itemRecord.alternatives.map((alternative) => parseAlternative(alternative, expected)),
        };
    });
    if (seen.size !== expectedById.size) {
        throw new Error("مولد الأسئلة لم يُعد جميع مفردات الخطة.");
    }
    return {
        items,
        model: typeof record.model === "string" && record.model.trim() ? record.model.trim() : "غير محدد",
        generatedAt: typeof record.generatedAt === "string" && record.generatedAt.trim()
            ? record.generatedAt.trim()
            : new Date().toISOString(),
        requestId: typeof record.requestId === "string" ? record.requestId.trim() : "",
    };
}
export function splitQuestionGenerationBatches(items, batchSize = GENERATION_BATCH_SIZE) {
    if (!Number.isInteger(batchSize) || batchSize < 1)
        throw new Error("حجم دفعة التوليد غير صالح.");
    const batches = [];
    let current = [];
    const isHeavy = (item) => {
        if (typeof item !== "object" || item === null)
            return false;
        const record = item;
        return record.questionType === "إجابة طويلة"
            || record.cognitiveLevel === "تطبيق"
            || record.cognitiveLevel === "استدلال"
            || (typeof record.marks === "number" && record.marks >= 2)
            || (typeof record.visualTarget === "string" && record.visualTarget !== "none");
    };
    const flush = () => { if (current.length) {
        batches.push(current);
        current = [];
    } };
    for (const item of items) {
        if (isHeavy(item)) {
            flush();
            batches.push([item]);
            continue;
        }
        current.push(item);
        if (current.length >= batchSize)
            flush();
    }
    flush();
    return batches;
}
function deriveQuestionDesignPattern(item, officialIndex, subject) {
    const normalizedSubject = subject.trim();
    if (item.questionType === "إجابة طويلة") {
        if (item.cognitiveLevel === "استدلال")
            return "استقصائي";
        if (normalizedSubject.includes("فيزياء") || normalizedSubject.includes("كيمياء"))
            return "حسابي";
        return officialIndex % 2 === 0 ? "بيانات" : "استقصائي";
    }
    if (item.cognitiveLevel === "استدلال")
        return officialIndex % 2 === 0 ? "بيانات" : "استقصائي";
    if (item.cognitiveLevel === "تطبيق") {
        if (normalizedSubject.includes("فيزياء"))
            return officialIndex % 2 === 0 ? "حسابي" : "بيانات";
        if (normalizedSubject.includes("كيمياء"))
            return officialIndex % 2 === 0 ? "سياقي" : "بيانات";
        return officialIndex % 2 === 0 ? "بيانات" : "سياقي";
    }
    if (item.marks >= 2)
        return "مقارنة";
    return item.questionType === "اختيار من متعدد" && officialIndex % 2 === 1 ? "سياقي" : "مفهومي";
}
function normalizeVisualText(value) {
    return value
        .normalize("NFKC")
        .replace(/[أإآٱ]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ة/g, "ه")
        .toLowerCase();
}
function deriveQuestionVisualTarget(item, officialIndex, subject, referenceContent) {
    const normalizedSubject = normalizeVisualText(subject);
    const evidence = normalizeVisualText(`${item.lessonLabel} ${referenceContent}`);
    const pattern = deriveQuestionDesignPattern(item, officialIndex, subject);
    if (normalizedSubject.includes("فيزياء")) {
        if (/(دائره|بطاريه|مصباح|مقاوم|تيار|جهد|مكثف|اميتر|فولتميتر)/u.test(evidence)) {
            if (item.cognitiveLevel === "معرفة" && item.marks === 1)
                return "none";
            return "circuit_diagram";
        }
        if (/(ضغط|سائل|عمق|كثافه|طفو)/u.test(evidence)) {
            if (item.cognitiveLevel === "معرفة" || item.marks === 1)
                return "none";
            if (pattern === "بيانات" || item.cognitiveLevel === "استدلال")
                return "line_graph";
            if (pattern === "مقارنة" && officialIndex % 2 === 1)
                return "none";
            return "pressure_diagram";
        }
        if (/(مسافه.{0,30}زمن|سرعه.{0,30}زمن|درجه حراره.{0,30}زمن|زمن.{0,30}(مسافه|سرعه|درجه حراره))/u.test(evidence)) {
            return item.cognitiveLevel === "معرفة" && item.marks === 1 ? "none" : "line_graph";
        }
        if (/(رسم بياني بالاعمده|مخطط اعمده|اعمده بيانيه)/u.test(evidence)) {
            return item.cognitiveLevel === "معرفة" && item.marks === 1 ? "none" : "bar_chart";
        }
    }
    return "none";
}
function generationItem(item, officialIndex, subject, referenceContent) {
    if (!item.sourceReferenceId)
        throw new Error("إحدى مفردات الخطة غير مرتبطة بصفحة مصدر.");
    return {
        planItemId: item.id,
        questionType: item.questionType,
        cognitiveLevel: item.cognitiveLevel,
        ...(item.difficultyLevel ? { difficultyLevel: item.difficultyLevel } : {}),
        marks: item.marks,
        sourceReferenceId: item.sourceReferenceId,
        lessonLabel: item.lessonLabel,
        styleTarget: deriveQuestionDesignPattern(item, officialIndex, subject),
        visualTarget: deriveQuestionVisualTarget(item, officialIndex, subject, referenceContent),
    };
}
export function buildQuestionGenerationRequest(assessmentType, topic, lessons, grade, subject, difficulty, references, requestedPlan, officialPlan = requestedPlan) {
    const normalizedLessons = lessons.map((lesson) => lesson.trim()).filter(Boolean);
    if (normalizedLessons.length < 2 || normalizedLessons.length > 5) {
        throw new Error("يجب أن يحتوي الاختبار على درسين إلى خمسة دروس.");
    }
    const referenceById = new Map(references.map((reference) => [reference.id, reference]));
    const usedReferenceIds = new Set(requestedPlan.map((item) => item.sourceReferenceId).filter((id) => Boolean(id)));
    const requestReferences = [...usedReferenceIds].map((referenceId) => {
        const reference = referenceById.get(referenceId);
        if (!reference)
            throw new Error("تعذر العثور على مرجع إحدى مفردات الخطة.");
        return {
            id: reference.id,
            sourceTitle: reference.sourceTitle,
            sourceKind: reference.sourceKind,
            pageFrom: reference.pageFrom,
            pageTo: reference.pageTo,
            content: (reference.context ?? reference.excerpt).trim(),
        };
    });
    const officialIndexById = new Map(officialPlan.map((item, index) => [item.id, index]));
    return {
        assessmentType,
        assessmentPolicyId: SCIENCE_ASSESSMENT_POLICY_ID,
        topic: topic.trim(),
        lessons: normalizedLessons,
        grade,
        subject,
        difficulty,
        references: requestReferences,
        officialPlanItems: officialPlan.map((item, index) => {
            const reference = item.sourceReferenceId ? referenceById.get(item.sourceReferenceId) : undefined;
            return generationItem(item, index, subject, (reference?.context ?? reference?.excerpt ?? "").trim());
        }),
        items: requestedPlan.map((item) => {
            const officialIndex = officialIndexById.get(item.id);
            if (officialIndex === undefined)
                throw new Error("إحدى مفردات الدفعة غير موجودة في الخطة الرسمية.");
            const reference = item.sourceReferenceId ? referenceById.get(item.sourceReferenceId) : undefined;
            return generationItem(item, officialIndex, subject, (reference?.context ?? reference?.excerpt ?? "").trim());
        }),
    };
}
export function applyGeneratedQuestions(plan, response) {
    const generatedById = new Map(response.items.map((item) => [item.planItemId, item]));
    return plan.map((item) => {
        const generated = generatedById.get(item.id);
        if (!generated)
            throw new Error("تعذر ربط الأسئلة المولدة بخطة الاختبار.");
        const proposals = generated.alternatives.map((alternative, index) => ({
            id: `${item.id}-proposal-${index + 1}`,
            ...(alternative.stimulus ? { stimulus: alternative.stimulus } : {}),
            text: alternative.text,
            options: alternative.options,
            answer: alternative.answer,
            rationale: alternative.rationale,
            markScheme: alternative.markScheme,
            questionForm: alternative.questionForm,
            workingRequired: alternative.workingRequired,
            sourceSupport: alternative.sourceSupport,
            needsReview: alternative.needsReview,
        }));
        return { ...item, visual: generated.visual, proposals };
    });
}
export class QuestionGenerationService {
    sessionProvider;
    fetcher;
    endpoint;
    publishableKey;
    constructor(config, sessionProvider, fetcher = browserFetch) {
        this.sessionProvider = sessionProvider;
        this.fetcher = fetcher;
        this.endpoint = `${config.supabaseUrl}/functions/v1/generate-source-questions`;
        this.publishableKey = config.supabasePublishableKey;
    }
    async generate(request) {
        const session = await this.sessionProvider();
        const controller = new AbortController();
        const timeout = globalThis.setTimeout(() => controller.abort(), 68_000);
        try {
            const response = await this.fetcher(this.endpoint, {
                method: "POST",
                headers: {
                    apikey: this.publishableKey,
                    Authorization: `Bearer ${session.accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(request),
                signal: controller.signal,
            });
            let payload = null;
            const text = await response.text();
            if (text) {
                try {
                    payload = JSON.parse(text);
                }
                catch {
                    payload = { error: text };
                }
            }
            if (!response.ok) {
                throw new Error(errorMessage(payload, `تعذر إنشاء الأسئلة (${response.status}).`));
            }
            return parseQuestionGenerationResponse(payload, request.items);
        }
        catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                throw new Error("تأخرت دفعة توليد الأسئلة أكثر من 65 ثانية. أعد المحاولة؛ لن تُفقد الدفعات المكتملة.");
            }
            throw error;
        }
        finally {
            globalThis.clearTimeout(timeout);
        }
    }
}
//# sourceMappingURL=question-generation.js.map