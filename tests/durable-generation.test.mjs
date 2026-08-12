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

test("فحص صحة عامل المفردات يطابق عقد المؤلف والمراجع المنفصلين", async () => {
  const service = new AssessmentGenerationWorkerService(
    { supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "sb_publishable_test" },
    async () => ({ accessToken: "token" }),
    async () => new Response(JSON.stringify({
      ok: true,
      worker: "assessment-generation-worker",
      engineSchemaVersion: 1,
      contractVersion: 4,
      visualContractVersion: 2,
      pressureControlVersion: 1,
      authorModel: "gemini-author",
      reviewModel: "gemini-reviewer",
      requestId: "r-health",
    }), { status: 200 }),
  );
  const health = await service.health();
  assert.equal(health.authorModel, "gemini-author");
  assert.equal(health.reviewModel, "gemini-reviewer");
  assert.equal(health.contractVersion, 4);
  assert.equal(health.visualContractVersion, 2);
  assert.equal(health.pressureControlVersion, 1);
});

test("فحص الصحة يرفض عاملًا قديمًا لا يعرف عقد القرار البصري الواحد", async () => {
  const service = new AssessmentGenerationWorkerService(
    { supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "sb_publishable_test" },
    async () => ({ accessToken: "token" }),
    async () => new Response(JSON.stringify({
      ok: true,
      worker: "assessment-generation-worker",
      engineSchemaVersion: 1,
      contractVersion: 4,
      authorModel: "gemini-author",
      reviewModel: "gemini-reviewer",
      requestId: "r-old",
    }), { status: 200 }),
  );
  await assert.rejects(() => service.health(), /عقد المرئيات والتحكم في الضغط الحالي/);
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

test("عامل المفردة يلتزم بآلة حالات Supabase: generating ثم normalizing ثم validating", async () => {
  const { readFile } = await import("node:fs/promises");
  const worker = await readFile(new URL("../supabase/functions/assessment-generation-worker/index.ts", import.meta.url), "utf8");
  const schema = await readFile(new URL("../supabase/schema-current.sql", import.meta.url), "utf8");
  const start = worker.indexOf("async function processItem(");
  const end = worker.indexOf("async function assertItemOwnedByUser(", start);
  assert.ok(start >= 0 && end > start, "تعذر تحديد processItem داخل عامل التوليد");
  const body = worker.slice(start, end);

  const generating = body.indexOf('await heartbeat(claimed, workerId, "generating")');
  const author = body.indexOf("await callAuthor(");
  const normalizing = body.indexOf('await heartbeat(claimed, workerId, "normalizing")');
  const normalizeAuthor = body.indexOf("normalizeModelContent(author.value, contract)");
  const validating = body.indexOf('await heartbeat(claimed, workerId, "validating")');
  const reviewer = body.indexOf("await callReviewer(");

  assert.ok(generating >= 0 && generating < author, "يجب دخول generating قبل استدعاء المؤلف");
  assert.ok(author < normalizing, "يجب الانتقال من generating إلى normalizing بعد المؤلف");
  assert.ok(normalizing < normalizeAuthor, "يجب تطبيع خرج المؤلف داخل مرحلة normalizing");
  assert.ok(normalizeAuthor < validating, "يجب إكمال التطبيع قبل دخول validating");
  assert.ok(validating < reviewer, "يجب أن يعمل المراجع داخل مرحلة validating");

  assert.match(schema, /v_current = 'grounding' and p_stage = 'generating'/);
  assert.match(schema, /v_current = 'generating' and p_stage = 'normalizing'/);
  assert.match(schema, /v_current = 'normalizing' and p_stage = 'validating'/);
});

test("منسق التوليد يوقف الطابور أثناء ضغط 429 ثم يستأنف تدريجيًا بمفردة واحدة", async () => {
  const secondItemId = "123e4567-e89b-42d3-a456-426614174002";
  let now = Date.parse("2026-08-12T00:00:20Z");
  const pressureItem = {
    ...baseItem("retry_pending"),
    attemptCount: 1,
    errorCode: "MODEL_RATE_LIMITED",
    errorMessage: "ضغط مؤقت",
    updatedAt: "2026-08-12T00:00:00Z",
  };
  const queuedItem = {
    ...baseItem("queued"),
    id: secondItemId,
    planItemId: "plan-2",
    contractHash: "d".repeat(64),
  };
  const pressureRun = {
    ...run("running", "queued"),
    totalItems: 2,
    items: [pressureItem, queuedItem],
  };
  const readyRun = {
    ...pressureRun,
    status: "completed",
    completedItems: 2,
    items: [
      { ...baseItem("ready"), updatedAt: "2026-08-12T00:01:05Z" },
      { ...baseItem("ready"), id: secondItemId, planItemId: "plan-2", contractHash: "d".repeat(64), updatedAt: "2026-08-12T00:01:05Z" },
    ],
  };
  const dispatches = [];
  const jobs = {
    enqueue: async () => ({ run: pressureRun, created: true, requestId: "r" }),
    list: async () => ({ run: dispatches.length ? readyRun : pressureRun, created: false, requestId: "r" }),
  };
  const worker = {
    processItem: async (id) => {
      dispatches.push({ id, at: now });
      return { accepted: true, itemId: id, requestId: "r" };
    },
  };
  const orchestrator = new ProgressiveAssessmentGenerationOrchestrator(jobs, worker, {
    concurrency: 2,
    pollIntervalMs: 250,
    dispatchCooldownMs: 1_000,
    now: () => now,
    sleep: async () => { now += 15_000; },
  });
  await orchestrator.start({}, []);
  assert.equal(dispatches.length, 1, "بعد رصد الضغط يجب خفض التوازي إلى مفردة واحدة");
  assert.equal(dispatches[0].id, itemId, "تعاد المفردة المؤجلة قبل إطلاق مفردة جديدة");
  assert.ok(dispatches[0].at >= Date.parse("2026-08-12T00:00:45Z"), "لا يجوز إعادة الإرسال قبل انتهاء مهلة 429");
});

test("عامل Gemini لا ينفذ إعادة نقل داخلية عند الضغط؛ كل مطالبة قاعدة بيانات تقابل نداء مزود واحد", async () => {
  const { readFile } = await import("node:fs/promises");
  const worker = await readFile(new URL("../supabase/functions/assessment-generation-worker/index.ts", import.meta.url), "utf8");
  const start = worker.indexOf("async function callJsonModel(");
  const end = worker.indexOf("function normalizeReviewResult", start);
  assert.ok(start >= 0 && end > start);
  const body = worker.slice(start, end);
  assert.doesNotMatch(body, /MODEL_TRANSIENT_RETRY_DELAYS_MS/);
  assert.doesNotMatch(body, /for \(let attempt/);
  assert.match(body, /providerCalls:\s*1/);
  assert.match(body, /MODEL_RATE_LIMITED/);
  assert.match(body, /transport_backoff/);
});
