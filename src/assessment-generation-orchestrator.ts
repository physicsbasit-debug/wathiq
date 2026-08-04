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
}

const ACTIVE_ITEM_STATUSES = new Set(["grounding", "generating", "normalizing", "validating"]);
const DISPATCHABLE_ITEM_STATUSES = new Set(["queued", "retry_pending"]);

export class ProgressiveAssessmentGenerationOrchestrator {
  private readonly concurrency: number;
  private readonly pollIntervalMs: number;
  private readonly dispatchCooldownMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly dispatchedAt = new Map<string, number>();
  private stopped = false;

  constructor(
    private readonly jobs: AssessmentGenerationJobService,
    private readonly worker: AssessmentGenerationWorkerService,
    options: ProgressiveGenerationOrchestratorOptions = {},
  ) {
    this.concurrency = Math.max(1, Math.min(4, Math.floor(options.concurrency ?? 2)));
    this.pollIntervalMs = Math.max(250, Math.floor(options.pollIntervalMs ?? 1_500));
    this.dispatchCooldownMs = Math.max(1_000, Math.floor(options.dispatchCooldownMs ?? 12_000));
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds)));
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
    const now = Date.now();
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
    const activeCount = snapshot.items.filter((item) => ACTIVE_ITEM_STATUSES.has(item.status)).length;
    const slots = Math.max(0, this.concurrency - activeCount);
    if (!slots) return;
    const now = Date.now();
    const candidates = snapshot.items
      .filter((item) => DISPATCHABLE_ITEM_STATUSES.has(item.status))
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
}
