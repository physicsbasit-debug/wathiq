import assert from "node:assert/strict";
import test from "node:test";
import { AssessmentGenerationJobService } from "../dist/assets/assessment-generation-jobs.js";
import { AssessmentGenerationWorkerService } from "../dist/assets/assessment-generation-worker.js";
import { ProgressiveAssessmentGenerationOrchestrator } from "../dist/assets/assessment-generation-orchestrator.js";

const runId = "123e4567-e89b-42d3-a456-426614174000";
const itemId = "123e4567-e89b-42d3-a456-426614174001";
const baseItem = (status = "queued") => ({
  id: itemId, runId, planItemId: "plan-1", contractHash: "c".repeat(64), status,
  attemptCount: status === "ready" ? 1 : 0, maxAttempts: 3, errorCode: "", errorMessage: "",
  stageTimings: { groundingMs: 0, modelMs: 0, normalizationMs: 0, validationMs: 0, totalMs: 0 },
  ...(status === "ready" ? { result: {
    planItemId: "plan-1", contractHash: "c".repeat(64),
    content: { stimulus: "", text: "سؤال", options: [], answer: "إجابة", rationale: "تفسير", markScheme: ["نقطة"] },
    evidence: { evidenceIndex: 0, evidenceHash: "e".repeat(64), excerpt: "دليل", score: 1 },
    visual: { type: "none" }, model: "author + reviewer", generatedAt: "2026-08-11T00:00:00Z", requestId: "req", durationMs: 10,
  } } : {}),
  startedAt: "", completedAt: status === "ready" ? "2026-08-11T00:00:01Z" : "", updatedAt: "2026-08-11T00:00:01Z",
});
const run = (status = "queued", itemStatus = "queued") => ({
  id: runId, draftId: "draft-1", generationEpoch: 1, planHash: "a".repeat(64), sourceSnapshotHash: "b".repeat(64),
  status, totalItems: 1, completedItems: itemStatus === "ready" ? 1 : 0, failedItems: 0, items: [baseItem(itemStatus)],
  startedAt: "", completedAt: itemStatus === "ready" ? "2026-08-11T00:00:01Z" : "", updatedAt: "2026-08-11T00:00:01Z",
});

test("عميل الدورات يقرأ حالة D4 الدائمة ويرسل جلسة المالك", async () => {
  const calls = [];
  const service = new AssessmentGenerationJobService(
    { supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "sb_publishable_test" },
    async () => ({ accessToken: "token" }),
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ run: run("running", "queued"), created: false, requestId: "r" }), { status: 200 });
    },
  );
  const result = await service.list("draft-1", runId);
  assert.equal(result.run?.id, runId);
  assert.match(calls[0].url, /assessment-generation-jobs$/);
  assert.equal(calls[0].init.headers.Authorization, "Bearer token");
});

test("عامل المفردة يستخدم المسار الدائم ولا يحتاج استجابة اختبار كاملة", async () => {
  const service = new AssessmentGenerationWorkerService(
    { supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "sb_publishable_test" },
    async () => ({ accessToken: "token" }),
    async () => new Response(JSON.stringify({ accepted: true, itemId, requestId: "r", outcome: { itemId, status: "ready", errorCode: "", errorMessage: "" } }), { status: 200 }),
  );
  const response = await service.processItem(itemId);
  assert.equal(response.outcome?.status, "ready");
});

test("المنسق ينفذ المفردة ثم يستأنف من الحالة الدائمة حتى ready", async () => {
  let lists = 0;
  let processed = 0;
  const jobs = {
    enqueue: async () => ({ run: run("running", "queued"), created: true, requestId: "r" }),
    list: async () => ({ run: ++lists >= 1 ? run("completed", "ready") : run("running", "queued"), created: false, requestId: "r" }),
  };
  const worker = { processItem: async () => { processed += 1; return { accepted: true, itemId, requestId: "r" }; } };
  const orchestrator = new ProgressiveAssessmentGenerationOrchestrator(jobs, worker, { pollIntervalMs: 1, dispatchCooldownMs: 1, sleep: async () => {} });
  const result = await orchestrator.start({}, []);
  assert.equal(processed, 1);
  assert.equal(result.items[0].status, "ready");
});
