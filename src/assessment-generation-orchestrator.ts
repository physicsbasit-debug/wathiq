import type {
  AssessmentBlueprint,
  AssessmentGenerationRunSnapshot,
  AssessmentItemContract,
} from "./assessment-engine/index.js";
import type { AssessmentGenerationJobService } from "./assessment-generation-jobs.js";
import type { AssessmentGenerationWorkerService } from "./assessment-generation-worker.js";

export interface ProgressiveGenerationHooks {
  onSnapshot?: (snapshot: AssessmentGenerationRunSnapshot) => void | Promise<void>;
  onWorkerError?: (itemId: string, error: unknown) => void;
}

export interface ProgressiveGenerationOrchestratorOptions {
  concurrency?: number;
  pollIntervalMs?: number;
  dispatchCooldownMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}

const ACTIVE_ITEM_STATUSES = new Set(["grounding", "generating", "normalizing", "validating"]);
const DISPATCHABLE_ITEM_STATUSES = new Set(["queued", "retry_pending"]);
const TRANSIENT_PRESSURE_CODES = new Set(["MODEL_RATE_LIMITED", "MODEL_UNAVAILABLE", "MODEL_TIMEOUT"]);
const MAX_PRESSURE_BACKOFF_MS = 180_000;

function transientBackoffMs(errorCode: string, attemptCount: number): number {
  const exponent = Math.max(0, Math.min(2, attemptCount - 1));
  const factor = 2 ** exponent;
  if (errorCode === "MODEL_RATE_LIMITED") return Math.min(MAX_PRESSURE_BACKOFF_MS, 45_000 * factor);
  if (errorCode === "MODEL_TIMEOUT") return Math.min(MAX_PRESSURE_BACKOFF_MS, 30_000 * factor);
  if (errorCode === "MODEL_UNAVAILABLE") return Math.min(MAX_PRESSURE_BACKOFF_MS, 20_000 * factor);
  return 0;
}

export class ProgressiveAssessmentGenerationOrchestrator {
  private readonly concurrency: number;
  private readonly pollIntervalMs: number;
  private readonly dispatchCooldownMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;
  private readonly dispatchedAt = new Map<string, number>();
  private stopped = false;
  private pressureMode = false;

  constructor(
    private readonly jobs: AssessmentGenerationJobService,
    private readonly worker: AssessmentGenerationWorkerService,
    options: ProgressiveGenerationOrchestratorOptions = {},
  ) {
    this.concurrency = Math.max(1, Math.min(4, Math.floor(options.concurrency ?? 2)));
    this.pollIntervalMs = Math.max(250, Math.floor(options.pollIntervalMs ?? 1_500));
    this.dispatchCooldownMs = Math.max(1_000, Math.floor(options.dispatchCooldownMs ?? 12_000));
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds)));
    this.now = options.now ?? (() => Date.now());
  }

  stop(): void {
    this.stopped = true;
  }

  async start(
    blueprint: AssessmentBlueprint,
    contracts: readonly AssessmentItemContract[],
    hooks: ProgressiveGenerationHooks = {},
  ): Promise<AssessmentGenerationRunSnapshot> {
    this.stopped = false;
    this.pressureMode = false;
    this.dispatchedAt.clear();
    const response = await this.jobs.enqueue(blueprint, contracts);
    if (!response.run) throw new Error("لم تُنشأ دورة توليد صالحة.");
    return this.drive(response.run, hooks);
  }

  async resume(
    draftId: string,
    runId: string,
    hooks: ProgressiveGenerationHooks = {},
  ): Promise<AssessmentGenerationRunSnapshot | null> {
    this.stopped = false;
    this.dispatchedAt.clear();
    const listed = await this.jobs.list(draftId, runId);
    if (!listed.run) return null;
    this.observePressure(listed.run, this.now());
    let snapshot = listed.run;
    if (snapshot.status === "partial" || snapshot.status === "failed") {
      const resumed = await this.jobs.resumeRun(snapshot.id);
      if (resumed.run) snapshot = resumed.run;
    }
    return this.drive(snapshot, hooks);
  }

  async retryItem(
    itemId: string,
    hooks: ProgressiveGenerationHooks = {},
  ): Promise<AssessmentGenerationRunSnapshot> {
    this.stopped = false;
    const response = await this.jobs.retryItem(itemId);
    if (!response.run) throw new Error("تعذر قراءة الدورة بعد إعادة المفردة.");
    this.dispatchedAt.delete(itemId);
    return this.drive(response.run, hooks);
  }

  private async drive(
    initial: AssessmentGenerationRunSnapshot,
    hooks: ProgressiveGenerationHooks,
  ): Promise<AssessmentGenerationRunSnapshot> {
    let snapshot = initial;
    while (!this.stopped) {
      await hooks.onSnapshot?.(snapshot);
      this.releaseObservedDispatches(snapshot);
      if (this.isSettled(snapshot)) return snapshot;
      await this.dispatchAvailable(snapshot, hooks);
      await this.sleep(this.pollIntervalMs);
      const listed = await this.jobs.list(snapshot.draftId, snapshot.id);
      if (!listed.run) throw new Error("اختفت دورة التوليد أثناء الاستكمال.");
      snapshot = listed.run;
    }
    return snapshot;
  }

  private releaseObservedDispatches(snapshot: AssessmentGenerationRunSnapshot): void {
    const now = this.now();
    for (const item of snapshot.items) {
      if (!DISPATCHABLE_ITEM_STATUSES.has(item.status) || now - (this.dispatchedAt.get(item.id) ?? 0) >= this.dispatchCooldownMs) {
        this.dispatchedAt.delete(item.id);
      }
    }
  }

  private isSettled(snapshot: AssessmentGenerationRunSnapshot): boolean {
    if (snapshot.items.every((item) => item.status === "ready")) return true;
    if (["cancelled", "superseded", "completed"].includes(snapshot.status)) return true;
    const hasWork = snapshot.items.some((item) => DISPATCHABLE_ITEM_STATUSES.has(item.status) || ACTIVE_ITEM_STATUSES.has(item.status));
    return !hasWork && snapshot.items.some((item) => item.status === "failed");
  }

  private async dispatchAvailable(
    snapshot: AssessmentGenerationRunSnapshot,
    hooks: ProgressiveGenerationHooks,
  ): Promise<void> {
    const now = this.now();
    const pressureUntil = this.observePressure(snapshot, now);
    if (now < pressureUntil) return;

    const activeCount = snapshot.items.filter((item) => ACTIVE_ITEM_STATUSES.has(item.status)).length;
    const effectiveConcurrency = this.pressureMode ? 1 : this.concurrency;
    const slots = Math.max(0, effectiveConcurrency - activeCount);
    if (!slots) return;

    const candidates = snapshot.items
      .filter((item) => DISPATCHABLE_ITEM_STATUSES.has(item.status))
      .filter((item) => this.itemRetryReady(item, now))
      .filter((item) => now - (this.dispatchedAt.get(item.id) ?? 0) >= this.dispatchCooldownMs)
      .slice(0, slots);

    await Promise.all(candidates.map(async (item) => {
      this.dispatchedAt.set(item.id, now);
      try {
        await this.worker.processItem(item.id);
      } catch (error) {
        // أبقِ بصمة الإرسال المؤقتة حتى لا يتحول انقطاع الشبكة إلى حلقة استدعاء كل دورة polling.
        // ستتحرر المهمة تلقائيًا بعد dispatchCooldownMs أو عند تغير حالتها خادميًا.
        hooks.onWorkerError?.(item.id, error);
      }
    }));
  }

  private observePressure(snapshot: AssessmentGenerationRunSnapshot, now: number): number {
    let pressureUntil = 0;
    for (const item of snapshot.items) {
      if (!TRANSIENT_PRESSURE_CODES.has(item.errorCode)) continue;
      if (item.status !== "retry_pending" && item.status !== "failed") continue;
      this.pressureMode = true;
      const updatedAt = Date.parse(item.updatedAt);
      if (!Number.isFinite(updatedAt)) continue;
      pressureUntil = Math.max(pressureUntil, updatedAt + transientBackoffMs(item.errorCode, item.attemptCount));
    }
    return pressureUntil > now ? pressureUntil : 0;
  }

  private itemRetryReady(item: AssessmentGenerationRunSnapshot["items"][number], now: number): boolean {
    if (item.status !== "retry_pending" || !TRANSIENT_PRESSURE_CODES.has(item.errorCode)) return true;
    const updatedAt = Date.parse(item.updatedAt);
    if (!Number.isFinite(updatedAt)) return false;
    return now >= updatedAt + transientBackoffMs(item.errorCode, item.attemptCount);
  }
}
