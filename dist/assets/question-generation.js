import { SCIENCE_ASSESSMENT_POLICY_ID } from "./assessment-policy.js";
import { parseQuestionVisualIllustration, parseQuestionVisualSpec } from "./question-visual.js";
import { parseScientificItemModel } from "./scientific-item.js";
export const SOURCE_GENERATION_VERSION = "source-grounded-policy-ai-16-assessment-quality-context-diversity";
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
export function shouldRequireCalculationWorking(questionForm, marks) {
    return questionForm === "حسابي" && Number.isFinite(marks) && marks >= 2;
}
const INTERNAL_GENERATION_TOKEN_PATTERN = /\(?\b(?:visual-plan|visual_item|blueprint-item|plan-item)[-_]?\d+\b\)?/giu;
export function sanitizeGeneratedQuestionText(value) {
    return value
        .replace(INTERNAL_GENERATION_TOKEN_PATTERN, " ")
        .replace(/\(\s*\)/gu, " ")
        .replace(/\s+([،؛:,.!?؟])/gu, "$1")
        .replace(/\s{2,}/gu, " ")
        .trim();
}
function safeExternalUrl(value) {
    if (!value)
        return "";
    try {
        const parsed = new URL(value);
        return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : "";
    }
    catch {
        return "";
    }
}
function parseAlternative(value, expected) {
    const record = asRecord(value);
    if (!record)
        throw new Error("استجابة مولد الأسئلة تحتوي بديلًا غير صالح.");
    const stimulus = typeof record.stimulus === "string" ? sanitizeGeneratedQuestionText(record.stimulus) : "";
    const text = typeof record.text === "string" ? sanitizeGeneratedQuestionText(record.text) : "";
    const options = Array.isArray(record.options)
        ? record.options.filter((item) => typeof item === "string").map((item) => sanitizeGeneratedQuestionText(item)).filter(Boolean)
        : [];
    const answer = typeof record.answer === "string" ? sanitizeGeneratedQuestionText(record.answer) : "";
    const rationale = typeof record.rationale === "string" ? sanitizeGeneratedQuestionText(record.rationale) : "";
    const markScheme = Array.isArray(record.markScheme)
        ? record.markScheme.filter((item) => typeof item === "string").map((item) => sanitizeGeneratedQuestionText(item)).filter(Boolean)
        : [];
    const questionForm = isQuestionDesignPattern(record.questionForm) ? record.questionForm : null;
    const workingRequired = shouldRequireCalculationWorking(questionForm ?? expected.styleTarget, expected.marks);
    const sourceSupport = typeof record.sourceSupport === "string" ? record.sourceSupport.trim() : "";
    const enrichmentSupport = typeof record.enrichmentSupport === "string" ? record.enrichmentSupport.trim() : "";
    const enrichmentSourceTitle = typeof record.enrichmentSourceTitle === "string" ? record.enrichmentSourceTitle.trim() : "";
    const enrichmentSourceUrl = safeExternalUrl(typeof record.enrichmentSourceUrl === "string" ? record.enrichmentSourceUrl.trim() : "");
    const needsReview = record.needsReview === true;
    const scientificItem = parseScientificItemModel(record.scientificItem);
    if (!text || !answer || !rationale || !sourceSupport || !questionForm) {
        throw new Error("استجابة مولد الأسئلة ناقصة ولا تصلح للعرض.");
    }
    if (questionForm !== expected.styleTarget) {
        throw new Error("مولد الأسئلة لم يلتزم بنمط السؤال المحدد في الخطة.");
    }
    if (markScheme.length !== expected.marks) {
        throw new Error("نموذج التصحيح لا يوزع نقطة واضحة لكل درجة.");
    }
    if (!hasSufficientQuestionContext(stimulus, text, questionForm, expected.visualTarget)) {
        throw new Error("أحد الأسئلة السياقية لا يحتوي متنًا أو بيانات كافية.");
    }
    if (expected.visualTarget !== "none") {
        const visualReference = normalizeVisualText(`${stimulus} ${text}`);
        if (!/(الشكل|الرسم|المخطط|الدائره|الجدول|التدريج|الجهاز|البيانات الممثله|التمثيل|المشهد)/u.test(visualReference)) {
            throw new Error("السؤال البصري لا يعتمد صراحة على الشكل المرفق.");
        }
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
    return { stimulus, text, options, answer, rationale, markScheme, questionForm, workingRequired, sourceSupport, enrichmentSupport, enrichmentSourceTitle, enrichmentSourceUrl, needsReview, ...(scientificItem ? { scientificItem } : {}) };
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
export function parseVisualIllustrationResponse(payload) {
    const record = asRecord(payload);
    if (!record || (record.status !== "ready" && record.status !== "fallback")) {
        throw new Error("استجابة تحسين الرسم غير صالحة.");
    }
    const illustration = parseQuestionVisualIllustration(record.illustration);
    if (record.status === "ready" && !illustration) {
        throw new Error("خدمة تحسين الرسم لم تُعد صورة صالحة.");
    }
    return {
        status: record.status,
        ...(illustration ? { illustration } : {}),
        reason: typeof record.reason === "string" ? record.reason.trim() : "",
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
    const normalizedSubject = normalizeVisualText(subject);
    const isPhysicalScience = normalizedSubject.includes("فيزياء") || normalizedSubject.includes("كيمياء");
    // الأسئلة الطويلة يجب أن تقيس حلاً أو استقصاءً حقيقيًا، لا تعريفًا مطولًا متنكرًا.
    if (item.questionType === "إجابة طويلة") {
        if (item.cognitiveLevel === "استدلال")
            return "استقصائي";
        if (item.cognitiveLevel === "تطبيق" && isPhysicalScience)
            return "حسابي";
        return officialIndex % 2 === 0 ? "بيانات" : "استقصائي";
    }
    if (item.cognitiveLevel === "استدلال") {
        const cycle = ["بيانات", "استقصائي", "مقارنة"];
        return cycle[officialIndex % cycle.length];
    }
    if (item.cognitiveLevel === "تطبيق") {
        if (normalizedSubject.includes("فيزياء")) {
            // يبدأ التطبيق بموقف حياتي ثم ينتقل للحساب والبيانات في التكرارات التالية.
            const cycle = ["سياقي", "حسابي", "بيانات"];
            return cycle[Math.max(0, officialIndex - 1) % cycle.length];
        }
        if (normalizedSubject.includes("كيمياء")) {
            const cycle = ["سياقي", "بيانات", "استقصائي"];
            return cycle[Math.max(0, officialIndex - 1) % cycle.length];
        }
        const cycle = ["سياقي", "بيانات", "مقارنة"];
        return cycle[Math.max(0, officialIndex - 1) % cycle.length];
    }
    if (item.marks >= 2)
        return "مقارنة";
    if (item.questionType === "اختيار من متعدد") {
        return officialIndex === 0 ? "مفهومي" : officialIndex % 2 === 0 ? "بيانات" : "سياقي";
    }
    // بعد أول سؤال مباشر نفضّل قراءة بيانات قصيرة بدل تكرار الاستدعاء اللفظي.
    return officialIndex === 0 ? "مفهومي" : officialIndex % 3 === 0 ? "بيانات" : "سياقي";
}
function normalizeVisualText(value) {
    return value
        .normalize("NFKC")
        .replace(/[أإآٱ]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ة/g, "ه")
        .toLowerCase();
}
function hasSufficientQuestionContext(stimulus, text, questionForm, visualTarget) {
    if (!["سياقي", "حسابي", "بيانات", "استقصائي"].includes(questionForm))
        return true;
    if (stimulus.trim().length >= 12)
        return true;
    const normalized = normalizeVisualText(text);
    const referencesVisual = /(الشكل|الرسم|المخطط|الدائره|الجدول|البيانات الممثله|التمثيل|التدريج|المشهد)/u.test(normalized);
    if (visualTarget !== "none" && referencesVisual)
        return true;
    const digitCount = (text.match(/[0-9٠-٩]/g) ?? []).length;
    if (questionForm === "حسابي") {
        return digitCount >= 2
            && /(احسب|اوجد|حدد)/u.test(normalized)
            && /(نيوتن|باسكال|متر|سم|ملم|ثانيه|دقيقه|فولت|امبير|اوم|جول|واط|كجم|جرام|درجه)/u.test(normalized);
    }
    if (questionForm === "بيانات") {
        return digitCount >= 2 || /(جدول|بيانات|نتائج|قيم|قراءه|قياسات)/u.test(normalized);
    }
    if (questionForm === "استقصائي") {
        return normalized.length >= 38
            && /(تجرب|متغير|قياس|اداه|خطوات|نتائج|دقه|موثوقيه|تحكم|ثابت)/u.test(normalized);
    }
    return normalized.length >= 42
        && /(عندما|اثناء|لاحظ|قام|استخدم|وضع|تعرض|في موقف|لدى|يمر|يعمل|اختار|يريد)/u.test(normalized);
}
const DEFAULT_SCENARIO_CYCLE = [
    "school_bag", "door_handle", "laboratory_setup", "shopping_trolley", "road_safety", "solar_panel", "water_tank", "bicycle_brake",
];
function scenarioCycleForEvidence(evidence) {
    if (/(عزم|ارتكاز|ذراع القوه|محور دوران)/u.test(evidence)) {
        return ["door_handle", "playground_seesaw", "wrench_tool", "bicycle_brake", "shopping_trolley", "school_bag"];
    }
    if (/(قوه|قوى|اتزان|احتكاك|حركه)/u.test(evidence)) {
        return ["shopping_trolley", "school_bag", "road_safety", "bicycle_brake", "laboratory_setup"];
    }
    if (/(ضغط|سائل|عمق|طفو|كثافه)/u.test(evidence)) {
        return ["water_tank", "school_bag", "laboratory_setup", "shopping_trolley"];
    }
    if (/(ضوء|انعكاس|انكسار|عدسه|مرآه|مراه|منشور)/u.test(evidence)) {
        return ["road_safety", "laboratory_setup", "solar_panel", "door_handle"];
    }
    if (/(كهرب|تيار|جهد|دائره|طاقه)/u.test(evidence)) {
        return ["solar_panel", "laboratory_setup", "road_safety", "school_bag"];
    }
    return DEFAULT_SCENARIO_CYCLE;
}
function deriveQuestionScenarioTarget(item, officialIndex, styleTarget, referenceContent) {
    if (styleTarget === "مفهومي" && item.cognitiveLevel === "معرفة")
        return "scientific_abstract";
    const evidence = normalizeVisualText(`${item.lessonLabel} ${referenceContent}`);
    const cycle = scenarioCycleForEvidence(evidence);
    return cycle[officialIndex % cycle.length] ?? "laboratory_setup";
}
function deriveQuestionVisualTarget(item, officialIndex, subject, referenceContent, pattern) {
    const normalizedSubject = normalizeVisualText(subject);
    const focusedEvidence = normalizeVisualText(`${item.lessonLabel} ${item.outcomeLabel}`);
    const evidence = normalizeVisualText(`${item.lessonLabel} ${item.outcomeLabel} ${referenceContent}`);
    const simpleKnowledge = item.cognitiveLevel === "معرفة" && item.marks === 1 && pattern === "مفهومي";
    if (normalizedSubject.includes("فيزياء")) {
        if (/(ترمومتر|ميزان حراره|مخبار|سحاحه|تدريج|قراءه جهاز|اميتر|فولتميتر|مسطره مدرجه)/u.test(evidence)) {
            return simpleKnowledge ? "none" : "instrument_scale";
        }
        if (/(انعكاس|انكسار|عدسه|مرآه|مراه|شعاع ضوئي|اشعه ضوئيه|ضوء|منشور|بصريات|زاويه السقوط|زاويه الانكسار)/u.test(evidence)) {
            if (simpleKnowledge)
                return "none";
            return "ray_diagram";
        }
        if (/(عزم|ارتكاز|ذراع القوه|محور دوران|اتزان دوراني)/u.test(focusedEvidence) || /(عزم|ارتكاز|ذراع القوه)/u.test(evidence)) {
            if (simpleKnowledge)
                return "none";
            if (pattern === "سياقي" || pattern === "استقصائي")
                return "context_scene";
            if (pattern === "بيانات")
                return "data_table";
            if (pattern === "مقارنة")
                return officialIndex % 2 === 0 ? "context_scene" : "data_table";
            if (pattern === "حسابي")
                return "force_diagram";
            return "force_diagram";
        }
        if (/(قوه|قوى|احتكاك|وزن|شد|رد فعل|اتزان|مخطط جسم حر)/u.test(evidence)) {
            if (simpleKnowledge)
                return "none";
            if (pattern === "سياقي" || pattern === "استقصائي")
                return "context_scene";
            if (pattern === "بيانات")
                return "data_table";
            if (pattern === "مقارنة")
                return officialIndex % 2 === 0 ? "context_scene" : "force_diagram";
            if (pattern === "حسابي")
                return "force_diagram";
            return "force_diagram";
        }
        if (/(خطوات|مراحل|تسلسل|تحول|دوره|عمليه|مسار)/u.test(evidence) && item.cognitiveLevel !== "معرفة") {
            return "flow_diagram";
        }
        if (/(جدول|قياسات|نتائج تجربه|سجل القراءات|بيانات التجربه)/u.test(evidence)) {
            return "data_table";
        }
        if (/(كهرباء ساكنه|كهربائيه ساكنه|شحنه|شحنت|الكترون|بروتون|مجال كهربائي|دلك|مسطره|قماش|تجاذب|تنافر|موصل|عازل)/u.test(evidence)) {
            if (simpleKnowledge)
                return "none";
            return pattern === "بيانات" ? "data_table" : "electrostatic_diagram";
        }
        if (/(دائره|بطاريه|مصباح|مقاوم|تيار|جهد|مكثف|اميتر|فولتميتر)/u.test(evidence)) {
            if (simpleKnowledge)
                return "none";
            if (pattern === "سياقي")
                return "context_scene";
            return pattern === "بيانات" ? "data_table" : "circuit_diagram";
        }
        if (/(ضغط|سائل|عمق|كثافه|طفو)/u.test(evidence)) {
            if (simpleKnowledge)
                return "none";
            if (pattern === "سياقي")
                return "context_scene";
            if (pattern === "بيانات" || item.cognitiveLevel === "استدلال")
                return officialIndex % 2 === 0 ? "line_graph" : "data_table";
            return "pressure_diagram";
        }
        if (/(مسافه.{0,30}زمن|سرعه.{0,30}زمن|درجه حراره.{0,30}زمن|زمن.{0,30}(مسافه|سرعه|درجه حراره))/u.test(evidence)) {
            return simpleKnowledge ? "none" : "line_graph";
        }
        if (/(رسم بياني بالاعمده|مخطط اعمده|اعمده بيانيه)/u.test(evidence)) {
            return simpleKnowledge ? "none" : "bar_chart";
        }
        if (pattern === "سياقي")
            return "context_scene";
    }
    if (pattern === "سياقي" && item.cognitiveLevel !== "معرفة")
        return "context_scene";
    return "none";
}
function deriveQuestionSkillTarget(item, pattern) {
    if (pattern === "حسابي")
        return "calculate";
    if (pattern === "بيانات")
        return item.cognitiveLevel === "استدلال" ? "interpret" : "apply";
    if (pattern === "مقارنة")
        return "compare";
    if (pattern === "استقصائي")
        return item.cognitiveLevel === "استدلال" ? "evaluate" : "investigate";
    if (pattern === "سياقي")
        return "apply";
    return "recognize";
}
function deriveQuestionStimulusTarget(pattern, visualTarget) {
    if (visualTarget === "context_scene")
        return "real_life_scene";
    if (visualTarget === "data_table")
        return "data_table";
    if (visualTarget === "line_graph" || visualTarget === "bar_chart")
        return "graph";
    if (visualTarget === "instrument_scale")
        return "instrument";
    if (visualTarget !== "none")
        return "scientific_diagram";
    if (pattern === "استقصائي")
        return "experiment";
    if (pattern === "مقارنة")
        return "decision_case";
    if (pattern === "سياقي")
        return "real_life_scene";
    return "concise_text";
}
function generationItem(item, officialIndex, subject, referenceContent) {
    if (!item.sourceReferenceId)
        throw new Error("إحدى مفردات الخطة غير مرتبطة بصفحة مصدر.");
    const styleTarget = deriveQuestionDesignPattern(item, officialIndex, subject);
    const scenarioTarget = deriveQuestionScenarioTarget(item, officialIndex, styleTarget, referenceContent);
    const visualTarget = deriveQuestionVisualTarget(item, officialIndex, subject, referenceContent, styleTarget);
    const stimulusTarget = deriveQuestionStimulusTarget(styleTarget, visualTarget);
    const skillTarget = deriveQuestionSkillTarget(item, styleTarget);
    return {
        planItemId: item.id,
        questionType: item.questionType,
        cognitiveLevel: item.cognitiveLevel,
        ...(item.difficultyLevel ? { difficultyLevel: item.difficultyLevel } : {}),
        marks: item.marks,
        sourceReferenceId: item.sourceReferenceId,
        lessonLabel: item.lessonLabel,
        outcomeLabel: item.outcomeLabel,
        styleTarget,
        visualTarget,
        scenarioTarget,
        stimulusTarget,
        skillTarget,
        diversityKey: `${styleTarget}|${visualTarget}|${scenarioTarget}|${skillTarget}|${officialIndex + 1}`,
    };
}
export function buildQuestionGenerationRequest(assessmentType, topic, lessons, grade, subject, difficulty, references, requestedPlan, officialPlan = requestedPlan, lessonCatalog = [], trustedEnrichmentEnabled = true) {
    const normalizedLessons = lessons.map((lesson) => lesson.trim()).filter(Boolean);
    if (normalizedLessons.length < 2 || normalizedLessons.length > 5) {
        throw new Error("يجب أن يحتوي الاختبار على درسين إلى خمسة دروس.");
    }
    const referenceById = new Map(references.map((reference) => [reference.id, reference]));
    const lessonByReferenceId = new Map();
    for (const item of officialPlan) {
        if (item.sourceReferenceId && !lessonByReferenceId.has(item.sourceReferenceId)) {
            lessonByReferenceId.set(item.sourceReferenceId, item.lessonLabel);
        }
    }
    const catalogByLessonAndSource = new Map(lessonCatalog.map((lesson) => [`${lesson.sourceId}::${lesson.label}`, lesson]));
    const usedReferenceIds = new Set(requestedPlan.map((item) => item.sourceReferenceId).filter((id) => Boolean(id)));
    const requestReferences = [...usedReferenceIds].map((referenceId) => {
        const reference = referenceById.get(referenceId);
        if (!reference)
            throw new Error("تعذر العثور على مرجع إحدى مفردات الخطة.");
        const lessonTopic = (reference.lessonTopic ?? lessonByReferenceId.get(referenceId) ?? "").trim();
        if (!lessonTopic)
            throw new Error("تعذر تحديد الدرس المرتبط بمرجع إحدى المفردات.");
        const catalogLesson = catalogByLessonAndSource.get(`${reference.sourceId}::${lessonTopic}`);
        const lessonPageFrom = catalogLesson?.pageStart;
        const lessonPageTo = catalogLesson?.pageEnd ?? lessonPageFrom;
        const overlaps = (from, to) => reference.pageFrom <= to && reference.pageTo >= from;
        const lessonScopeMode = lessonPageFrom && lessonPageTo
            ? overlaps(lessonPageFrom, lessonPageTo)
                ? "page-range"
                : overlaps(Math.max(1, lessonPageFrom - 3), lessonPageTo + 3)
                    ? "page-neighborhood"
                    : "strict-title-fallback"
            : "legacy-title";
        return {
            id: reference.id,
            sourceId: reference.sourceId,
            sourceTitle: reference.sourceTitle,
            sourceKind: reference.sourceKind,
            pageFrom: reference.pageFrom,
            pageTo: reference.pageTo,
            content: (reference.context ?? reference.excerpt).trim(),
            lessonTopic,
            lessonScopeMode,
            ...(lessonPageFrom && lessonPageTo ? { lessonPageFrom, lessonPageTo } : {}),
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
        trustedEnrichmentEnabled,
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
            ...(alternative.enrichmentSupport ? { enrichmentSupport: alternative.enrichmentSupport } : {}),
            ...(alternative.enrichmentSourceTitle ? { enrichmentSourceTitle: alternative.enrichmentSourceTitle } : {}),
            ...(alternative.enrichmentSourceUrl ? { enrichmentSourceUrl: alternative.enrichmentSourceUrl } : {}),
            needsReview: alternative.needsReview,
            ...(alternative.scientificItem ? { scientificItem: alternative.scientificItem } : {}),
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
    async postJson(payload, timeoutMs, timeoutMessage) {
        const session = await this.sessionProvider();
        const controller = new AbortController();
        const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await this.fetcher(this.endpoint, {
                method: "POST",
                headers: {
                    apikey: this.publishableKey,
                    Authorization: `Bearer ${session.accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            let responsePayload = null;
            const text = await response.text();
            if (text) {
                try {
                    responsePayload = JSON.parse(text);
                }
                catch {
                    responsePayload = { error: text };
                }
            }
            if (!response.ok) {
                throw new Error(errorMessage(responsePayload, `تعذر تنفيذ الطلب (${response.status}).`));
            }
            return responsePayload;
        }
        catch (error) {
            if (error instanceof DOMException && error.name === "AbortError")
                throw new Error(timeoutMessage);
            throw error;
        }
        finally {
            globalThis.clearTimeout(timeout);
        }
    }
    async generate(request) {
        const payload = await this.postJson(request, 95_000, "تأخرت دفعة توليد الأسئلة أكثر من 90 ثانية. أعد المحاولة؛ لن تُفقد الدفعات المكتملة.");
        return parseQuestionGenerationResponse(payload, request.items);
    }
    async generateWholeExam(request) {
        return this.postJson(request, 145_000, "تأخر تصميم الاختبار الكامل. احتفظ واثق بالمسودة الحالية؛ أعد المحاولة دون فقد المحتوى المختار.");
    }
    async generateIllustration(request) {
        const payload = await this.postJson(request, 75_000, "تأخر تحسين الرسم. احتفظ واثق بالرسم العلمي الحتمي ويمكن إعادة المحاولة لاحقًا.");
        return parseVisualIllustrationResponse(payload);
    }
}
//# sourceMappingURL=question-generation.js.map