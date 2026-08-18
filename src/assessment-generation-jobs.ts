
import type { WathiqRuntimeConfig } from "./runtime-config.js";
import {
  type AssessmentBlueprint,
  type AssessmentEngineErrorCode,
  type AssessmentGeneratedItemResult,
  type AssessmentGenerationItemSnapshot,
  type AssessmentGenerationItemStatus,
  type AssessmentGenerationRunSnapshot,
  type AssessmentGenerationRunStatusString,
  type AssessmentGenerationStageTimings,
  type AssessmentItemContract,
} from "./assessment-engine/index.js";

interface OwnerSessionLike { accessToken: string }
type SessionProvider = () => Promise<OwnerSessionLike>;
type FetchLike = typeof fetch;

export interface AssessmentGenerationJobsResponse {
  run: AssessmentGenerationRunSnapshot | null;
  created: boolean;
  requestId: string;
}

const RUN_STATUSES = new Set<AssessmentGenerationRunStatusString>([
  "queued", "running", "reviewing", "completed", "partial", "failed", "cancelled", "superseded",
  "RUNNING", "COMPLETED", "FAILED"
]);

const ITEM_STATUSES = new Set<AssessmentGenerationItemStatus>([
  "queued", "grounding", "generating", "normalizing", "validating", "ready", "retry_pending", "failed", "cancelled", "superseded",
  "PENDING", "GENERATING", "COMPLETED", "FAILED"
]);

const ERROR_CODES = new Set<AssessmentEngineErrorCode>([
  "INVALID_BLUEPRINT", "INVALID_ITEM_CONTRACT", "STALE_PLAN", "AUTHORIZATION_FAILED",
  "MODEL_TIMEOUT", "MODEL_RATE_LIMITED", "MODEL_QUOTA_EXHAUSTED", "MODEL_UNAVAILABLE",
  "MODEL_REQUEST_INVALID", "MODEL_AUTH_FAILED", "MODEL_NOT_FOUND", "MODEL_OUTPUT_TRUNCATED", "MODEL_OUTPUT_BLOCKED",
  "MODEL_INVALID_JSON", "MODEL_INCOMPLETE_CONTENT", "MODEL_SCIENTIFIC_MISMATCH", "MODEL_ASSESSMENT_MISMATCH",
  "GLOBAL_DUPLICATION", "CANCELLED_BY_USER", "SUPERSEDED_BY_NEW_RUN", "INTERNAL_ERROR",
]);

export class AssessmentGenerationJobService {
  private readonly endpoint: string;
  private readonly publishableKey: string;

  constructor(
    config: WathiqRuntimeConfig,
    private readonly sessionProvider: SessionProvider,
    private readonly fetcher: FetchLike = (input, init) => globalThis.fetch(input, init),
  ) {
    this.endpoint = `${config.supabaseUrl}/functions/v1/assessment-generation-jobs`;
    this.publishableKey = config.supabasePublishableKey;
  }

  async enqueue(
    blueprint: AssessmentBlueprint,
    contracts: readonly AssessmentItemContract[],
  ): Promise<AssessmentGenerationJobsResponse> {
    return this.post({ action: "enqueue", blueprint, contracts });
  }

  async list(draftId: string, runId = ""): Promise<AssessmentGenerationJobsResponse> {
    return this.post({ action: "list", draftId, ...(runId ? { runId } : {}) });
  }

  async retryItem(itemId: string): Promise<AssessmentGenerationJobsResponse> {
    return this.post({ action: "retry", itemId });
  }

  async cancelRun(runId: string): Promise<AssessmentGenerationJobsResponse> {
    return this.post({ action: "cancel", runId });
  }

  async resumeRun(runId: string): Promise<AssessmentGenerationJobsResponse> {
    return this.post({ action: "resume", runId });
  }

  private async post(payload: unknown): Promise<AssessmentGenerationJobsResponse> {
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
    if (!response.ok) throw new Error(errorMessage(body, `تعذر الاتصال بمنظومة توليد الاختبارات (${response.status}).`));
    return parseResponse(body);
  }
}

function parseResponse(value: unknown): AssessmentGenerationJobsResponse {
  const record = asRecord(value);
  if (!record) throw new Error("استجابة منظومة توليد الاختبارات غير صالحة.");
  const run = record.run === null || typeof record.run === "undefined" ? null : parseRun(record.run);
  if (record.run !== null && typeof record.run !== "undefined" && !run) {
    throw new Error("استجابة دورة توليد الاختبار غير صالحة.");
  }
  return {
    run,
    created: record.created === true,
    requestId: typeof record.requestId === "string" ? record.requestId : "",
  };
}

function parseRun(value: unknown): AssessmentGenerationRunSnapshot | null {
  const record = asRecord(value);
  if (!record
    || !isUuid(record.id)
    || typeof record.draftId !== "string" || !record.draftId
    || !isInteger(record.generationEpoch, 1)
    || !isHash(record.planHash)
    || !isHash(record.sourceSnapshotHash)
    || typeof record.status !== "string" || !RUN_STATUSES.has(record.status as AssessmentGenerationRunStatusString)
    || !isInteger(record.totalItems, 1, 40)
    || !isInteger(record.completedItems, 0, 40)
    || !isInteger(record.failedItems, 0, 40)
    || !Array.isArray(record.items)
    || typeof record.startedAt !== "string"
    || typeof record.completedAt !== "string"
    || typeof record.updatedAt !== "string") return null;
  const items = record.items.map(parseItem);
  if (items.some((item) => !item)) return null;
  const validItems = items as AssessmentGenerationItemSnapshot[];
  
  // بناء كائن متوافق جذرياً مع الواجهة الصارمة في contracts.ts مع الحفاظ على البيانات القديمة
  const snapshot: AssessmentGenerationRunSnapshot = {
    runId: record.id,
    status: record.status as AssessmentGenerationRunStatusString,
    items: validItems
  };
  
  Object.assign(snapshot, {
    id: record.id,
    draftId: record.draftId,
    generationEpoch: record.generationEpoch,
    planHash: record.planHash,
    sourceSnapshotHash: record.sourceSnapshotHash,
    totalItems: record.totalItems,
    completedItems: record.completedItems,
    failedItems: record.failedItems,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    updatedAt: record.updatedAt,
  });
  
  return snapshot;
}

function parseItem(value: unknown): AssessmentGenerationItemSnapshot | null {
  const record = asRecord(value);
  if (!record
    || !isUuid(record.id)
    || !isUuid(record.runId)
    || typeof record.planItemId !== "string" || !record.planItemId
    || !isHash(record.contractHash)
    || typeof record.status !== "string" || !ITEM_STATUSES.has(record.status as AssessmentGenerationItemStatus)
    || !isInteger(record.attemptCount, 0, 10)
    || !isInteger(record.maxAttempts, 1, 5)
    || !isInteger(record.transportRetryCount, 0, 100)
    || typeof record.retryAfterAt !== "string"
    || typeof record.errorCode !== "string"
    || typeof record.errorMessage !== "string"
    || typeof record.startedAt !== "string"
    || typeof record.completedAt !== "string"
    || typeof record.updatedAt !== "string") return null;
  const stageTimings = parseStageTimings(record.stageTimings);
  if (!stageTimings) return null;
  const result = parseGeneratedResult(record.result);
  if (typeof record.result !== "undefined" && !result) return null;
  if (record.status === "ready" && !result) return null;
  
  const snapshot: AssessmentGenerationItemSnapshot = {
    itemId: record.id,
    status: record.status as AssessmentGenerationItemStatus,
    timestamp: Date.now()
  };
  
  Object.assign(snapshot, {
    id: record.id,
    runId: record.runId,
    planItemId: record.planItemId,
    contractHash: record.contractHash,
    attemptCount: record.attemptCount,
    maxAttempts: record.maxAttempts,
    transportRetryCount: record.transportRetryCount,
    retryAfterAt: record.retryAfterAt,
    errorCode: ERROR_CODES.has(record.errorCode as AssessmentEngineErrorCode)
      ? record.errorCode as AssessmentEngineErrorCode
      : "",
    errorMessage: arabicMessage(record.errorMessage, record.errorCode ? "تعذر تنفيذ المفردة. راجع حالة المهمة أو أعد المحاولة." : ""),
    stageTimings,
    ...(result ? { result } : {}),
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    updatedAt: record.updatedAt,
  });
  
  return snapshot;
}

function parseStageTimings(value: unknown): AssessmentGenerationStageTimings | null {
  const record = asRecord(value);
  if (!record) return null;
  for (const key of ["groundingMs", "modelMs", "normalizationMs", "validationMs", "totalMs"] as const) {
    if (typeof record[key] !== "number" || !Number.isFinite(record[key]) || record[key] < 0) return null;
  }
  
  const timings: AssessmentGenerationStageTimings = {
    blueprintGeneration: (record.groundingMs as number) || 0,
    itemGeneration: (record.modelMs as number) || 0,
    validation: (record.validationMs as number) || 0,
  };
  
  Object.assign(timings, {
    groundingMs: record.groundingMs as number,
    modelMs: record.modelMs as number,
    normalizationMs: record.normalizationMs as number,
    validationMs: record.validationMs as number,
    totalMs: record.totalMs as number,
  });
  
  return timings;
}

function parseGeneratedResult(value: unknown): AssessmentGeneratedItemResult | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  if (typeof record.planItemId !== "string" || !record.planItemId
    || !isHash(record.contractHash)
    || !asRecord(record.content)
    || !asRecord(record.evidence)
    || !asRecord(record.visual)
    || typeof record.model !== "string" || !record.model
    || typeof record.generatedAt !== "string" || !record.generatedAt
    || typeof record.requestId !== "string" || !record.requestId
    || typeof record.durationMs !== "number" || !Number.isFinite(record.durationMs) || record.durationMs < 0) return undefined;
    
  return record as unknown as AssessmentGeneratedItemResult;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isInteger(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function arabicMessage(value: unknown, fallback: string): string {
  return typeof value === "string" && /[\u0600-\u06FF]/u.test(value) ? value : fallback;
}

function errorMessage(payload: unknown, fallback: string): string {
  const record = asRecord(payload);
  for (const key of ["error", "message", "details", "hint"]) {
    const value = record?.[key];
    if (typeof value === "string" && /[\u0600-\u06FF]/u.test(value)) return value;
  }
  return fallback;
}
