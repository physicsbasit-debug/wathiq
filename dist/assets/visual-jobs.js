import { questionVisualAssetRequirement, stripQuestionVisualIllustration } from "./question-visual.js";
import { scientificItemMatchesVisual } from "./scientific-item.js";
const PENDING_STATUSES = new Set(["queued", "generating", "validating", "retry_pending"]);
const JOB_BATCH_SIZE = 20;
export function isVisualJobPending(status) {
    return PENDING_STATUSES.has(status);
}
export function requiredVisualJobItems(draft, subject) {
    if (draft.grade === null)
        return [];
    return draft.plan.flatMap((item) => {
        if (!item.visual || item.visual.type === "none")
            return [];
        const requirement = questionVisualAssetRequirement(item.visual);
        if (!requirement.required || !requirement.mode)
            return [];
        const proposal = selectedProposalForVisual(draft, item);
        if (!proposal?.scientificItem || !scientificItemMatchesVisual(proposal.scientificItem, item.visual))
            return [];
        return [{
                planItemId: item.id,
                grade: draft.grade,
                subject,
                lessonLabel: item.lessonLabel,
                questionText: `${proposal.stimulus ? `${proposal.stimulus} ` : ""}${proposal.text}`.trim(),
                sourceSupport: proposal.sourceSupport || item.outcomeLabel || item.lessonLabel,
                previousAssetPath: item.visual.illustration?.assetPath ?? "",
                requiredMode: requirement.mode,
                scientificItem: proposal.scientificItem,
                visual: stripQuestionVisualIllustration(item.visual),
            }];
    });
}
function selectedProposalForVisual(draft, item) {
    const selectedId = draft.selectedProposalByPlanItem[item.id];
    return item.proposals.find((proposal) => proposal.id === selectedId) ?? item.proposals[0];
}
function errorMessage(payload, fallback) {
    if (typeof payload !== "object" || payload === null)
        return fallback;
    const record = payload;
    for (const key of ["error", "message", "details", "hint"]) {
        if (typeof record[key] === "string" && record[key])
            return record[key];
    }
    return fallback;
}
function parseAsset(value) {
    if (typeof value !== "object" || value === null)
        return undefined;
    const record = value;
    if (typeof record.url !== "string" || !record.url.startsWith("https://")
        || typeof record.assetPath !== "string" || !record.assetPath
        || typeof record.mimeType !== "string" || !record.mimeType.startsWith("image/")
        || typeof record.model !== "string" || !record.model
        || typeof record.generatedAt !== "string" || !record.generatedAt
        || typeof record.promptVersion !== "string" || !record.promptVersion
        || record.validated !== true)
        return undefined;
    return {
        url: record.url,
        assetPath: record.assetPath,
        mimeType: record.mimeType,
        model: record.model,
        generatedAt: record.generatedAt,
        promptVersion: record.promptVersion,
        validated: true,
        assetKind: record.assetKind === "scene_2d_overlay" ? "scene_2d_overlay" : "scene_2d",
        renderMode: record.renderMode === "overlay" ? "overlay" : "replace",
    };
}
function parseJob(value) {
    if (typeof value !== "object" || value === null)
        return null;
    const record = value;
    const allowed = new Set(["queued", "generating", "validating", "ready", "retry_pending", "failed", "cancelled"]);
    if (typeof record.id !== "string" || typeof record.draftId !== "string" || typeof record.planItemId !== "string"
        || typeof record.visualHash !== "string" || (record.requiredMode !== "replace" && record.requiredMode !== "overlay")
        || typeof record.status !== "string" || !allowed.has(record.status)
        || typeof record.attemptCount !== "number" || typeof record.maxAttempts !== "number"
        || typeof record.updatedAt !== "string")
        return null;
    const asset = parseAsset(record.asset);
    return {
        id: record.id,
        draftId: record.draftId,
        planItemId: record.planItemId,
        visualHash: record.visualHash,
        requiredMode: record.requiredMode,
        status: record.status,
        attemptCount: record.attemptCount,
        maxAttempts: record.maxAttempts,
        errorCode: typeof record.errorCode === "string" ? record.errorCode : "",
        errorMessage: typeof record.errorMessage === "string" ? record.errorMessage : "",
        ...(asset ? { asset } : {}),
        startedAt: typeof record.startedAt === "string" ? record.startedAt : "",
        completedAt: typeof record.completedAt === "string" ? record.completedAt : "",
        updatedAt: record.updatedAt,
    };
}
function parseJobsResponse(value) {
    if (typeof value !== "object" || value === null || !Array.isArray(value.jobs)) {
        throw new Error("استجابة منظومة الصور غير صالحة.");
    }
    return (value.jobs ?? []).map(parseJob).filter((job) => Boolean(job));
}
export class VisualJobService {
    sessionProvider;
    fetcher;
    endpoint;
    publishableKey;
    constructor(config, sessionProvider, fetcher = (input, init) => globalThis.fetch(input, init)) {
        this.sessionProvider = sessionProvider;
        this.fetcher = fetcher;
        this.endpoint = `${config.supabaseUrl}/functions/v1/question-visual-jobs`;
        this.publishableKey = config.supabasePublishableKey;
    }
    async enqueue(draftId, items) {
        if (!items.length)
            return [];
        const jobs = [];
        for (let index = 0; index < items.length; index += JOB_BATCH_SIZE) {
            jobs.push(...await this.post({ action: "enqueue", draftId, items: items.slice(index, index + JOB_BATCH_SIZE) }));
        }
        return jobs;
    }
    async list(draftId) {
        return this.post({ action: "list", draftId });
    }
    async retry(jobId) {
        return this.post({ action: "retry", jobId });
    }
    async cancel(jobId) {
        return this.post({ action: "cancel", jobId });
    }
    async post(payload) {
        const session = await this.sessionProvider();
        const response = await this.fetcher(this.endpoint, {
            method: "POST",
            headers: {
                apikey: this.publishableKey,
                Authorization: `Bearer ${session.accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });
        const text = await response.text();
        let body = null;
        if (text) {
            try {
                body = JSON.parse(text);
            }
            catch {
                body = { error: text };
            }
        }
        if (!response.ok)
            throw new Error(errorMessage(body, `تعذر الاتصال بمنظومة الصور (${response.status}).`));
        return parseJobsResponse(body);
    }
}
//# sourceMappingURL=visual-jobs.js.map