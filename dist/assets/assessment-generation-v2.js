import { applyGeneratedQuestions, buildQuestionGenerationRequest, shouldRequireCalculationWorking, sanitizeGeneratedQuestionText, } from "./question-generation.js";
import { parseQuestionVisualSpec } from "./question-visual.js";
import { parseScientificItemModel } from "./scientific-item.js";
export const ASSESSMENT_GENERATION_V2_VERSION = "source-grounded-policy-ai-24-context-aware-moment-contract";
function normalizeArabic(value) {
    return value
        .normalize("NFKC")
        .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
        .replace(/[أإآٱ]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ة/g, "ه")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}
function conceptTokens(value) {
    const stop = new Set(["درس", "الوحده", "الوحدة", "التعلم", "يحدد", "يصف", "يفسر", "يحسب", "يطبق", "يقارن", "يستنتج", "الطالب"]);
    return [...new Set(normalizeArabic(value).split(" ").filter((token) => token.length >= 3 && !stop.has(token)))].slice(0, 12);
}
export function buildLessonCardsV2(plan, references) {
    const referenceById = new Map(references.map((reference) => [reference.id, reference]));
    const grouped = new Map();
    for (const item of plan) {
        const items = grouped.get(item.lessonLabel) ?? [];
        items.push(item);
        grouped.set(item.lessonLabel, items);
    }
    return [...grouped.entries()].map(([lessonLabel, items]) => {
        const lessonReferences = items
            .map((item) => item.sourceReferenceId ? referenceById.get(item.sourceReferenceId) : undefined)
            .filter((reference) => Boolean(reference));
        const outcomes = [...new Set(items.map((item) => item.outcomeLabel.trim()).filter(Boolean))];
        const sourceText = lessonReferences
            .map((reference) => (reference.context ?? reference.excerpt).trim())
            .filter(Boolean)
            .join(" ")
            .slice(0, 2_400);
        return {
            lessonLabel,
            learningOutcomes: outcomes.length ? outcomes : [lessonLabel],
            concepts: conceptTokens(`${lessonLabel} ${outcomes.join(" ")} ${sourceText}`),
            sourceReferenceIds: [...new Set(lessonReferences.map((reference) => reference.id))],
            sourceSummary: sourceText,
        };
    });
}
export function buildAssessmentBlueprintV2(items) {
    return {
        version: "whole-exam-blueprint-v1",
        totalMarks: items.reduce((sum, item) => sum + item.marks, 0),
        itemCount: items.length,
        lessons: [...new Set(items.map((item) => item.lessonLabel))],
        items: items.map((item, index) => ({
            order: index + 1,
            planItemId: item.planItemId,
            lessonLabel: item.lessonLabel,
            learningOutcome: item.outcomeLabel,
            questionType: item.questionType,
            cognitiveLevel: item.cognitiveLevel,
            marks: item.marks,
            styleTarget: item.styleTarget,
            visualTarget: item.visualTarget,
            scenarioTarget: item.scenarioTarget,
            stimulusTarget: item.stimulusTarget,
            skillTarget: item.skillTarget,
            diversityKey: item.diversityKey,
        })),
        globalReviewRules: [
            "صمم الاختبار كوحدة واحدة قبل كتابة أي سؤال.",
            "لا تكرر الفكرة أو بنية البيانات أو السياق أو الرسم بين سؤالين إلا في مجموعة مترابطة مقصودة.",
            "تحقق من قابلية حل كل سؤال من المعطيات الظاهرة وحدها.",
            "اجعل السياق الحياتي جزءًا من التفكير المطلوب لا قصة زخرفية.",
            "نوّع بين النص والجدول والرسم البياني والمخطط والمشهد عندما يخدم الهدف.",
            "راجع الاختبار كاملًا علميًا وتقويميًا قبل إرجاعه.",
        ],
    };
}
function fallbackStimulusTarget(item) {
    if (item.styleTarget === "سياقي")
        return "real_life_scene";
    if (item.styleTarget === "بيانات")
        return "data_table";
    if (item.styleTarget === "استقصائي")
        return "experiment";
    if (item.styleTarget === "مقارنة")
        return "decision_case";
    return "concise_text";
}
function visualPriority(item) {
    if (item.visualTarget === "none")
        return 0;
    const precisionVisuals = [
        "data_table", "line_graph", "bar_chart", "instrument_scale", "ray_diagram",
        "force_diagram", "circuit_diagram", "pressure_diagram", "electrostatic_diagram", "flow_diagram",
    ];
    let score = precisionVisuals.includes(item.visualTarget) ? 40 : 15;
    if (item.styleTarget === "بيانات" || item.styleTarget === "حسابي")
        score += 25;
    if (item.cognitiveLevel === "استدلال")
        score += 12;
    if (item.marks >= 2)
        score += 8;
    return score;
}
export function applyWholeExamVisualBudget(items) {
    const maxVisuals = items.length <= 6 ? 4 : items.length <= 10 ? 5 : 6;
    const selected = new Set(items
        .map((item, index) => ({ index, score: visualPriority(item) }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .slice(0, maxVisuals)
        .map((entry) => entry.index));
    return items.map((item, index) => {
        if (item.visualTarget === "none" || selected.has(index))
            return item;
        return {
            ...item,
            visualTarget: "none",
            stimulusTarget: fallbackStimulusTarget(item),
            diversityKey: `${item.styleTarget}|none|${item.scenarioTarget}|${item.skillTarget}|${index + 1}`,
        };
    });
}
export function buildWholeExamGenerationRequestV2(assessmentType, topic, lessons, grade, subject, difficulty, references, plan, lessonCatalog = [], trustedEnrichmentEnabled = true) {
    const base = buildQuestionGenerationRequest(assessmentType, topic, lessons, grade, subject, difficulty, references, plan, plan, lessonCatalog, trustedEnrichmentEnabled);
    const optimizedOfficialPlanItems = applyWholeExamVisualBudget(base.officialPlanItems);
    const optimizedById = new Map(optimizedOfficialPlanItems.map((item) => [item.planItemId, item]));
    const optimizedItems = base.items.map((item) => optimizedById.get(item.planItemId) ?? item);
    const globalAssessmentReferences = references
        .filter((reference) => reference.sourceKind === "اختبار كامبريدج" || reference.sourceKind === "مصدر عالمي")
        .map((reference) => ({
        id: reference.id,
        sourceTitle: reference.sourceTitle,
        sourceKind: reference.sourceKind,
        excerpt: (reference.context ?? reference.excerpt).trim().slice(0, 2_000),
    }));
    return {
        action: "generate_exam_v2",
        generationMode: "whole_exam_v2",
        generationVersion: ASSESSMENT_GENERATION_V2_VERSION,
        ...base,
        officialPlanItems: optimizedOfficialPlanItems,
        items: optimizedItems,
        lessonCards: buildLessonCardsV2(plan, references),
        blueprint: buildAssessmentBlueprintV2(optimizedOfficialPlanItems),
        globalAssessmentReferences,
    };
}
function asRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value
        : null;
}
function safeUrl(value) {
    if (typeof value !== "string" || !value.trim())
        return "";
    try {
        const url = new URL(value.trim());
        return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
    }
    catch {
        return "";
    }
}
function parseProposal(value, expected) {
    const record = asRecord(value);
    if (!record)
        throw new Error("محرك الاختبار الكامل أعاد سؤالًا غير صالح.");
    const text = typeof record.text === "string" ? sanitizeGeneratedQuestionText(record.text) : "";
    const answer = typeof record.answer === "string" ? sanitizeGeneratedQuestionText(record.answer) : "";
    const rationale = typeof record.rationale === "string" ? sanitizeGeneratedQuestionText(record.rationale) : "";
    const sourceSupport = typeof record.sourceSupport === "string" ? sanitizeGeneratedQuestionText(record.sourceSupport) : "";
    const stimulus = typeof record.stimulus === "string" ? sanitizeGeneratedQuestionText(record.stimulus) : "";
    const options = Array.isArray(record.options)
        ? record.options.filter((item) => typeof item === "string").map((item) => sanitizeGeneratedQuestionText(item)).filter(Boolean)
        : [];
    const markScheme = Array.isArray(record.markScheme)
        ? record.markScheme.filter((item) => typeof item === "string").map((item) => sanitizeGeneratedQuestionText(item)).filter(Boolean)
        : [];
    const scientificItem = parseScientificItemModel(record.scientificItem);
    if (!text || !answer || !rationale || !sourceSupport)
        throw new Error("محرك الاختبار الكامل أعاد سؤالًا ناقصًا.");
    if (markScheme.length !== expected.marks)
        throw new Error("نموذج التصحيح في الاختبار الكامل لا يطابق درجة السؤال.");
    if (expected.questionType === "اختيار من متعدد") {
        if (options.length !== 4 || new Set(options).size !== 4 || !options.includes(answer)) {
            throw new Error("سؤال اختيار من متعدد في الاختبار الكامل غير مكتمل.");
        }
    }
    else if (options.length) {
        throw new Error("سؤال إنشائي في الاختبار الكامل أعاد بدائل غير مطلوبة.");
    }
    return {
        id: `${expected.planItemId}-v2-primary`,
        ...(stimulus ? { stimulus } : {}),
        text,
        options,
        answer,
        rationale,
        markScheme,
        questionForm: expected.styleTarget,
        workingRequired: shouldRequireCalculationWorking(expected.styleTarget, expected.marks),
        sourceSupport,
        enrichmentSupport: typeof record.enrichmentSupport === "string" ? record.enrichmentSupport.trim() : "",
        enrichmentSourceTitle: typeof record.enrichmentSourceTitle === "string" ? record.enrichmentSourceTitle.trim() : "",
        enrichmentSourceUrl: safeUrl(record.enrichmentSourceUrl),
        needsReview: record.needsReview === true,
        ...(scientificItem ? { scientificItem } : {}),
    };
}
function validateWholeExamDiversity(items) {
    const signatures = new Set();
    const numericFingerprints = new Set();
    let directRecallCount = 0;
    for (const { proposal } of items) {
        const material = normalizeArabic(`${proposal.stimulus ?? ""} ${proposal.text}`);
        const signature = material.split(" ").filter((token) => token.length >= 3).slice(0, 18).join(" ");
        if (signature && signatures.has(signature))
            throw new Error("الاختبار الكامل يحتوي سؤالين متطابقين أو شبه متطابقين.");
        signatures.add(signature);
        const numbers = `${proposal.stimulus ?? ""} ${proposal.text}`.match(/[0-9٠-٩]+(?:[.,][0-9٠-٩]+)?/g) ?? [];
        if (numbers.length >= 3) {
            const fingerprint = numbers.join("|");
            if (numericFingerprints.has(fingerprint))
                throw new Error("الاختبار الكامل يعيد مجموعة البيانات العددية نفسها في أكثر من سؤال.");
            numericFingerprints.add(fingerprint);
        }
        if (/(ما المقصود|عرف|اكتب تعريف|اذكر وحده|ما وحده قياس|حدد المصطلح)/u.test(material))
            directRecallCount += 1;
    }
    if (items.length >= 5 && directRecallCount > 1)
        throw new Error("الاختبار الكامل يعتمد على الاستدعاء المباشر أكثر من اللازم.");
}
export function parseWholeExamGenerationResponseV2(payload, requestedItems) {
    const record = asRecord(payload);
    if (!record || !Array.isArray(record.items))
        throw new Error("استجابة محرك الاختبار الكامل غير صالحة.");
    const expectedById = new Map(requestedItems.map((item) => [item.planItemId, item]));
    const seen = new Set();
    const parsedForReview = [];
    const items = record.items.map((rawItem) => {
        const itemRecord = asRecord(rawItem);
        const planItemId = typeof itemRecord?.planItemId === "string" ? itemRecord.planItemId : "";
        const expected = expectedById.get(planItemId);
        if (!expected || seen.has(planItemId) || !Array.isArray(itemRecord?.alternatives) || itemRecord.alternatives.length !== 1) {
            throw new Error("محرك الاختبار الكامل لم يعد سؤالًا واحدًا لكل مفردة.");
        }
        seen.add(planItemId);
        const proposal = parseProposal(itemRecord.alternatives[0], expected);
        parsedForReview.push({ expected, proposal });
        return {
            planItemId,
            visual: parseQuestionVisualSpec(itemRecord.visual, expected.visualTarget),
            alternatives: [{
                    stimulus: proposal.stimulus ?? "",
                    text: proposal.text,
                    options: proposal.options ?? [],
                    answer: proposal.answer,
                    rationale: proposal.rationale ?? "",
                    markScheme: proposal.markScheme ?? [],
                    questionForm: proposal.questionForm ?? expected.styleTarget,
                    workingRequired: proposal.workingRequired === true,
                    sourceSupport: proposal.sourceSupport ?? "",
                    enrichmentSupport: proposal.enrichmentSupport ?? "",
                    enrichmentSourceTitle: proposal.enrichmentSourceTitle ?? "",
                    enrichmentSourceUrl: proposal.enrichmentSourceUrl ?? "",
                    needsReview: proposal.needsReview === true,
                    ...(proposal.scientificItem ? { scientificItem: proposal.scientificItem } : {}),
                }],
        };
    });
    if (seen.size !== expectedById.size)
        throw new Error("محرك الاختبار الكامل لم يعد جميع أسئلة الخطة.");
    validateWholeExamDiversity(parsedForReview);
    return {
        items,
        model: typeof record.model === "string" && record.model.trim() ? record.model.trim() : "غير محدد",
        generatedAt: typeof record.generatedAt === "string" && record.generatedAt.trim() ? record.generatedAt.trim() : new Date().toISOString(),
        requestId: typeof record.requestId === "string" ? record.requestId.trim() : "",
    };
}
export function applyWholeExamQuestionsV2(plan, response) {
    const applied = applyGeneratedQuestions(plan, response);
    return applied.map((item) => ({
        ...item,
        proposals: item.proposals.slice(0, 1).map((proposal) => ({ ...proposal, id: `${item.id}-v2-primary` })),
    }));
}
//# sourceMappingURL=assessment-generation-v2.js.map