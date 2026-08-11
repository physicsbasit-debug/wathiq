import type { WathiqRuntimeConfig } from "./runtime-config.js";

interface OwnerSessionLike { accessToken: string }
type SessionProvider = () => Promise<OwnerSessionLike>;
type FetchLike = typeof fetch;

export type AssessmentGenerationWorkerStatus = "ready" | "retry_pending" | "failed" | "skipped" | "stale";

export interface AssessmentGenerationWorkerOutcome {
  itemId: string;
  status: AssessmentGenerationWorkerStatus;
  errorCode: string;
  errorMessage: string;
}

export interface AssessmentGenerationWorkerResponse {
  accepted: boolean;
  itemId: string;
  requestId: string;
  outcome?: AssessmentGenerationWorkerOutcome;
}

export interface AssessmentGenerationWorkerHealth {
  ok: boolean;
  worker: string;
  engineSchemaVersion: number;
  contractVersion: number;
  model: string;
  requestId: string;
}

export class AssessmentGenerationWorkerService {
  private readonly endpoint: string;
  private readonly publishableKey: string;

  constructor(
    config: WathiqRuntimeConfig,
    private readonly sessionProvider: SessionProvider,
    private readonly fetcher: FetchLike = (input, init) => globalThis.fetch(input, init),
  ) {
    this.endpoint = `${config.supabaseUrl}/functions/v1/assessment-generation-worker`;
    this.publishableKey = config.supabasePublishableKey;
  }

  async health(): Promise<AssessmentGenerationWorkerHealth> {
    const record = asRecord(await this.post({ action: "health" }));
    if (!record || record.ok !== true || record.worker !== "assessment-generation-worker"
      || typeof record.engineSchemaVersion !== "number" || typeof record.contractVersion !== "number"
      || typeof record.model !== "string" || typeof record.requestId !== "string") {
      throw new Error("استجابة عامل توليد المفردات غير صالحة.");
    }
    return record as unknown as AssessmentGenerationWorkerHealth;
  }

  async processItem(itemId: string): Promise<AssessmentGenerationWorkerResponse> {
    return parseWorkerResponse(await this.post({ action: "process", itemId }), itemId);
  }

  async processItemSynchronously(itemId: string): Promise<AssessmentGenerationWorkerResponse> {
    return parseWorkerResponse(await this.post({ action: "process-sync", itemId }), itemId);
  }

  private async post(payload: unknown): Promise<unknown> {
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
    if (!response.ok) throw new Error(errorMessage(body, `تعذر الاتصال بعامل توليد المفردات (${response.status}).`));
    return body;
  }
}

function parseWorkerResponse(value: unknown, expectedItemId: string): AssessmentGenerationWorkerResponse {
  const record = asRecord(value);
  if (!record || record.accepted !== true || record.itemId !== expectedItemId || typeof record.requestId !== "string") {
    throw new Error("استجابة تشغيل عامل المفردة غير صالحة.");
  }
  const outcomeRecord = asRecord(record.outcome);
  return {
    accepted: true,
    itemId: expectedItemId,
    requestId: record.requestId,
    ...(outcomeRecord ? { outcome: parseOutcome(outcomeRecord, expectedItemId) } : {}),
  };
}

function parseOutcome(record: Record<string, unknown>, expectedItemId: string): AssessmentGenerationWorkerOutcome {
  const statuses = new Set<AssessmentGenerationWorkerStatus>(["ready", "retry_pending", "failed", "skipped", "stale"]);
  if (record.itemId !== expectedItemId || typeof record.status !== "string" || !statuses.has(record.status as AssessmentGenerationWorkerStatus)) {
    throw new Error("نتيجة عامل المفردة غير صالحة.");
  }
  return {
    itemId: expectedItemId,
    status: record.status as AssessmentGenerationWorkerStatus,
    errorCode: typeof record.errorCode === "string" ? record.errorCode : "",
    errorMessage: typeof record.errorMessage === "string" ? record.errorMessage : "",
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function errorMessage(payload: unknown, fallback: string): string {
  const record = asRecord(payload);
  for (const key of ["error", "message", "details", "hint"]) {
    const value = record?.[key];
    if (typeof value === "string" && /[\u0600-\u06FF]/u.test(value)) return value;
  }
  return fallback;
}
