import type {
  ExamDraft,
  PlanItem,
  QuestionVisualIllustration,
  QuestionVisualJobSnapshot,
  VisualJobRequiredMode,
  VisualJobStatus,
} from "./types.js";
import type { WathiqRuntimeConfig } from "./runtime-config.js";
import { questionVisualAssetRequirement, stripQuestionVisualIllustration } from "./question-visual.js";

interface OwnerSessionLike { accessToken: string }
type SessionProvider = () => Promise<OwnerSessionLike>;
type FetchLike = typeof fetch;

interface VisualJobInput {
  planItemId: string;
  grade: number;
  subject: string;
  lessonLabel: string;
  questionText: string;
  sourceSupport: string;
  previousAssetPath: string;
  requiredMode: VisualJobRequiredMode;
  visual: Record<string, unknown>;
}

interface JobsResponse { jobs: QuestionVisualJobSnapshot[] }

const PENDING_STATUSES = new Set<VisualJobStatus>(["queued", "generating", "validating", "retry_pending"]);
const JOB_BATCH_SIZE = 20;

export function isVisualJobPending(status: VisualJobStatus): boolean {
  return PENDING_STATUSES.has(status);
}

export function requiredVisualJobItems(draft: ExamDraft, subject: string): VisualJobInput[] {
  if (draft.grade === null) return [];
  return draft.plan.flatMap((item) => {
    if (!item.visual || item.visual.type === "none") return [];
    const requirement = questionVisualAssetRequirement(item.visual);
    if (!requirement.required || !requirement.mode) return [];
    const proposal = selectedProposalForVisual(draft, item);
    if (!proposal) return [];
    return [{
      planItemId: item.id,
      grade: draft.grade!,
      subject,
      lessonLabel: item.lessonLabel,
      questionText: `${proposal.stimulus ? `${proposal.stimulus} ` : ""}${proposal.text}`.trim(),
      sourceSupport: proposal.sourceSupport || item.lessonLabel,
      previousAssetPath: item.visual.illustration?.assetPath ?? "",
      requiredMode: requirement.mode,
      visual: stripQuestionVisualIllustration(item.visual) as unknown as Record<string, unknown>,
    }];
  });
}

function selectedProposalForVisual(draft: ExamDraft, item: PlanItem): PlanItem["proposals"][number] | undefined {
  const selectedId = draft.selectedProposalByPlanItem[item.id];
  return item.proposals.find((proposal) => proposal.id === selectedId) ?? item.proposals[0];
}

function errorMessage(payload: unknown, fallback: string): string {
  if (typeof payload !== "object" || payload === null) return fallback;
  const record = payload as Record<string, unknown>;
  for (const key of ["error", "message", "details", "hint"]) {
    if (typeof record[key] === "string" && record[key]) return record[key] as string;
  }
  return fallback;
}

function parseAsset(value: unknown): QuestionVisualIllustration | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.url !== "string" || !record.url.startsWith("https://")
    || typeof record.assetPath !== "string" || !record.assetPath
    || typeof record.mimeType !== "string" || !record.mimeType.startsWith("image/")
    || typeof record.model !== "string" || !record.model
    || typeof record.generatedAt !== "string" || !record.generatedAt
    || typeof record.promptVersion !== "string" || !record.promptVersion
    || record.validated !== true) return undefined;
  return {
    url: record.url,
    assetPath: record.assetPath,
    mimeType: record.mimeType,
    model: record.model,
    generatedAt: record.generatedAt,
    promptVersion: record.promptVersion,
    validated: true,
    assetKind: "scene_2d",
    renderMode: "replace",
  };
}

function parseJob(value: unknown): QuestionVisualJobSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const allowed = new Set<VisualJobStatus>(["queued", "generating", "validating", "ready", "retry_pending", "failed", "cancelled"]);
  if (typeof record.id !== "string" || typeof record.draftId !== "string" || typeof record.planItemId !== "string"
    || typeof record.visualHash !== "string" || (record.requiredMode !== "replace" && record.requiredMode !== "overlay")
    || typeof record.status !== "string" || !allowed.has(record.status as VisualJobStatus)
    || typeof record.attemptCount !== "number" || typeof record.maxAttempts !== "number"
    || typeof record.updatedAt !== "string") return null;
  const asset = parseAsset(record.asset);
  return {
    id: record.id,
    draftId: record.draftId,
    planItemId: record.planItemId,
    visualHash: record.visualHash,
    requiredMode: "replace",
    status: record.status as VisualJobStatus,
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

function parseJobsResponse(value: unknown): QuestionVisualJobSnapshot[] {
  if (typeof value !== "object" || value === null || !Array.isArray((value as Record<string, unknown>).jobs)) {
    throw new Error("استجابة منظومة الصور غير صالحة.");
  }
  return ((value as JobsResponse).jobs ?? []).map(parseJob).filter((job): job is QuestionVisualJobSnapshot => Boolean(job));
}

export class VisualJobService {
  private readonly endpoint: string;
  private readonly publishableKey: string;

  constructor(
    config: WathiqRuntimeConfig,
    private readonly sessionProvider: SessionProvider,
    private readonly fetcher: FetchLike = (input, init) => globalThis.fetch(input, init),
  ) {
    this.endpoint = `${config.supabaseUrl}/functions/v1/question-visual-jobs`;
    this.publishableKey = config.supabasePublishableKey;
  }

  async enqueue(draftId: string, items: VisualJobInput[]): Promise<QuestionVisualJobSnapshot[]> {
    if (!items.length) return [];
    const jobs: QuestionVisualJobSnapshot[] = [];
    for (let index = 0; index < items.length; index += JOB_BATCH_SIZE) {
      jobs.push(...await this.post({ action: "enqueue", draftId, items: items.slice(index, index + JOB_BATCH_SIZE) }));
    }
    return jobs;
  }

  async list(draftId: string): Promise<QuestionVisualJobSnapshot[]> {
    return this.post({ action: "list", draftId });
  }

  async retry(jobId: string): Promise<QuestionVisualJobSnapshot[]> {
    return this.post({ action: "retry", jobId });
  }

  async cancel(jobId: string): Promise<QuestionVisualJobSnapshot[]> {
    return this.post({ action: "cancel", jobId });
  }

  private async post(payload: unknown): Promise<QuestionVisualJobSnapshot[]> {
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
    let body: unknown = null;
    if (text) {
      try { body = JSON.parse(text) as unknown; }
      catch { body = { error: text }; }
    }
    if (!response.ok) throw new Error(errorMessage(body, `تعذر الاتصال بمنظومة الصور (${response.status}).`));
    return parseJobsResponse(body);
  }
}
