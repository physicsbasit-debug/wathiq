import assert from "node:assert/strict";
import test from "node:test";
import { AssessmentGenerationJobService } from "../dist/assets/assessment-generation-jobs.js";
import { AssessmentGenerationWorkerService } from "../dist/assets/assessment-generation-worker.js";
import { ProgressiveAssessmentGenerationOrchestrator } from "../dist/assets/assessment-generation-orchestrator.js";

const runId = "123e4567-e89b-42d3-a456-426614174000";
const itemId = "123e4567-e89b-42d3-a456-426614174001";
const baseItem = (status = "queued") => ({
  id: itemId, runId, planItemId: "plan-1", contractHash: "c".repeat(64), status,
  attemptCount: status === "ready" ? 1 : 0, maxAttempts: 3, transportRetryCount: 0, retryAfterAt: "", errorCode: "", errorMessage: "",
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
      visualContractVersion: 3,
      thinItemContractVersion: 1,
      visualPlannerVersion: 1,
      pressureControlVersion: 4,
      providerProtocolVersion: 3,
      databaseContractVersion: 1,
      authorModel: "gemini-author",
      reviewModel: "gemini-reviewer",
      visualPlannerModel: "gemini-visual",
      requestId: "r-health",
    }), { status: 200 }),
  );
  const health = await service.health();
  assert.equal(health.authorModel, "gemini-author");
  assert.equal(health.reviewModel, "gemini-reviewer");
  assert.equal(health.contractVersion, 4);
  assert.equal(health.visualContractVersion, 3);
  assert.equal(health.thinItemContractVersion, 1);
  assert.equal(health.visualPlannerVersion, 1);
  assert.equal(health.pressureControlVersion, 4);
  assert.equal(health.providerProtocolVersion, 3);
  assert.equal(health.databaseContractVersion, 1);
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
  await assert.rejects(() => service.health(), /عقد التأليف النحيف ومخطط المرئيات المتخصص الحالي/);
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
  const normalizeAuthor = body.indexOf("normalizeAuthoredItemContent(author.value, contract)");
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
    attemptCount: 0,
    transportRetryCount: 1,
    retryAfterAt: "2026-08-12T00:00:45Z",
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
  assert.ok(dispatches[0].at >= Date.parse("2026-08-12T00:00:45Z"), "لا يجوز إعادة الإرسال قبل retryAfterAt القادم من المزود");
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
  assert.match(body, /classifyProviderPressure/);
  assert.match(body, /MODEL_QUOTA_EXHAUSTED/);
  assert.match(body, /transport_backoff/);
});


test("تأجيل النقل لا يستهلك محاولة السؤال ويحترم موعد المزود", async () => {
  const { readFile } = await import("node:fs/promises");
  const migration = await readFile(new URL("../supabase/migrations/20260812_assessment_generation_quota_aware_retry.sql", import.meta.url), "utf8");
  assert.match(migration, /attempt_count\s*=\s*case[\s\S]*transport_backoff[\s\S]*greatest\(attempt_count - 1, 0\)/i);
  assert.match(migration, /retry_after_at[\s\S]*make_interval\(secs => v_retry_after\)/i);
  assert.match(migration, /transport_retry_count between 0 and 100/i);
  assert.doesNotMatch(migration, /transport_retry_count\s*<\s*2/i);
});

test("العامل يحفظ خرج المؤلف قبل المراجع ويعيد استخدامه بعد ضغط المراجعة", async () => {
  const { readFile } = await import("node:fs/promises");
  const worker = await readFile(new URL("../supabase/functions/assessment-generation-worker/index.ts", import.meta.url), "utf8");
  const processStart = worker.indexOf("async function processItem(");
  const processEnd = worker.indexOf("async function assertItemOwnedByUser(", processStart);
  const body = worker.slice(processStart, processEnd);
  assert.match(body, /parseAuthorCheckpoint\(claimed\.author_checkpoint, contract\)/);
  assert.match(body, /saveAuthorCheckpoint\(claimed, workerId, authoredContent, author\.tokenUsage\)/);
  assert.match(worker, /checkpoint_assessment_generation_author/);
  assert.match(worker, /MODEL_QUOTA_EXHAUSTED/);
  assert.match(worker, /providerRetryInfoSeconds/);
});


test("v0.3.12 يفحص عقد قاعدة البيانات وGemini مسبقًا قبل إنشاء دورة كاملة", async () => {
  const calls = [];
  const service = new AssessmentGenerationWorkerService(
    { supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "sb_publishable_test" },
    async () => ({ accessToken: "token" }),
    async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ ok: true, worker: "assessment-generation-worker", providerProtocolVersion: 3, thinItemContractVersion: 1, visualPlannerVersion: 1, databaseContractVersion: 1, requestId: "p" }), { status: 200 });
    },
  );
  await service.preflight();
  assert.equal(calls[0].action, "preflight");
});

test("عامل v0.3.12 لا يصنف HTTP 400 من Gemini على أنه JSON محتوى", async () => {
  const { readFile } = await import("node:fs/promises");
  const worker = await readFile(new URL("../supabase/functions/assessment-generation-worker/index.ts", import.meta.url), "utf8");
  assert.match(worker, /status === 400[\s\S]*MODEL_REQUEST_INVALID/);
  assert.match(worker, /status === 401 \|\| status === 403[\s\S]*MODEL_AUTH_FAILED/);
  assert.match(worker, /status === 404[\s\S]*MODEL_NOT_FOUND/);
  assert.match(worker, /finishReason === "MAX_TOKENS"[\s\S]*MODEL_OUTPUT_TRUNCATED/);
  assert.match(worker, /thinkingLevel: "high" \| "medium" \| "low"/);
  assert.match(worker, /"medium", AUTHOR_MODEL_TIMEOUT_MS/);
  assert.match(worker, /"medium", REVIEW_MODEL_TIMEOUT_MS/);
});

test("مخطط المرئي v0.3.12 يقيد الإحداثيات ويدعم القوة الرمزية F", async () => {
  const { readFile } = await import("node:fs/promises");
  const worker = await readFile(new URL("../supabase/functions/assessment-generation-worker/index.ts", import.meta.url), "utf8");
  assert.match(worker, /valueLabel:\s*\{ type: "string" \}/);
  assert.match(worker, /minimum: 0, maximum: 100/);
  assert.match(worker, /required: \["mode", "brief"\]/);
  assert.match(worker, /magnitude=0 وvalueLabel=F/);
});


test("v0.3.12 يفصل تأجيل ضغط المزود عن فشل المحتوى في RPC مستقلتين", async () => {
  const { readFile } = await import("node:fs/promises");
  const worker = await readFile(new URL("../supabase/functions/assessment-generation-worker/index.ts", import.meta.url), "utf8");
  assert.match(worker, /defer_assessment_generation_item_v1/);
  assert.match(worker, /fail_assessment_generation_content_v1/);
  const catchStart = worker.indexOf("if (mapped.retryClass === \"transport_backoff\")");
  assert.ok(catchStart >= 0, "يجب أن يملك ضغط المزود مسار RPC مستقلًا");
});

test("v0.3.12 يفحص عقد قاعدة البيانات في health قبل بدء التوليد", async () => {
  const { readFile } = await import("node:fs/promises");
  const worker = await readFile(new URL("../supabase/functions/assessment-generation-worker/index.ts", import.meta.url), "utf8");
  assert.match(worker, /assessment_generation_runtime_contract_v1/);
  assert.match(worker, /databaseContractVersion:\s*1/);
  assert.match(worker, /DATABASE_RUNTIME_MISMATCH/);
});

test("v0.3.12 يستخرج تفاصيل QuotaFailure الآمنة بدل رسالة 429 عامة فقط", async () => {
  const { readFile } = await import("node:fs/promises");
  const worker = await readFile(new URL("../supabase/functions/assessment-generation-worker/index.ts", import.meta.url), "utf8");
  assert.match(worker, /function quotaFailureSummary/);
  assert.match(worker, /quotaMetric/);
  assert.match(worker, /quotaId/);
  assert.match(worker, /quotaValue/);
  assert.match(worker, /quotaDimensions/);
});

test("v0.3.13 يفصل عقد السؤال النحيف عن بيانات الرسم التفصيلية", async () => {
  const { readFile } = await import("node:fs/promises");
  const worker = await readFile(new URL("../supabase/functions/assessment-generation-worker/index.ts", import.meta.url), "utf8");
  const itemStart = worker.indexOf("function itemSchema(");
  const itemEnd = worker.indexOf("function authorSchema(", itemStart);
  assert.ok(itemStart >= 0 && itemEnd > itemStart);
  const itemSchemaBody = worker.slice(itemStart, itemEnd);
  assert.match(itemSchemaBody, /visualIntent:\s*visualIntentSchema\(\)/);
  assert.doesNotMatch(itemSchemaBody, /vectors|anchors|segments|dimensions|series|components/);
  assert.doesNotMatch(worker, /function visualSchema\(/);
});

test("v0.3.13 يستخدم مخطط مرئي متخصص حسب النوع بعد اعتماد السؤال", async () => {
  const { readFile } = await import("node:fs/promises");
  const worker = await readFile(new URL("../supabase/functions/assessment-generation-worker/index.ts", import.meta.url), "utf8");
  assert.match(worker, /function visualPlannerSchema\(mode: VisualMode\)/);
  assert.match(worker, /mode === "force_diagram"[\s\S]*vectors[\s\S]*anchors[\s\S]*segments[\s\S]*dimensions/);
  assert.match(worker, /mode === "circuit_diagram"[\s\S]*components/);
  assert.match(worker, /mode === "line_graph" \|\| mode === "bar_chart"[\s\S]*series/);
  assert.match(worker, /VISUAL_PLANNER_MODEL/);
  assert.match(worker, /visualPlannerVersion:\s*1/);
});

test("v0.3.13 لا يطلب Visual Planner عند عدم وجود مرئي أو عند المشهد السياقي الحر", async () => {
  const { readFile } = await import("node:fs/promises");
  const worker = await readFile(new URL("../supabase/functions/assessment-generation-worker/index.ts", import.meta.url), "utf8");
  const start = worker.indexOf("async function callVisualPlanner(");
  const end = worker.indexOf("function emptyVisualProposal", start);
  assert.ok(start >= 0 && end > start);
  const body = worker.slice(start, end);
  assert.match(body, /intent\.mode === "none" \|\| intent\.mode === "illustration_2d"/);
  assert.match(body, /return \{ visual: emptyVisualProposal/);
});

test("v0.3.13 يخطط المرئي بعد المراجعة العلمية لا قبلها", async () => {
  const { readFile } = await import("node:fs/promises");
  const worker = await readFile(new URL("../supabase/functions/assessment-generation-worker/index.ts", import.meta.url), "utf8");
  const start = worker.indexOf("async function processItem(");
  const end = worker.indexOf("function parseAuthorCheckpoint", start);
  const body = worker.slice(start, end);
  const reviewer = body.indexOf("await callReviewer(");
  const approved = body.indexOf("if (!reviewed.approved)");
  const planner = body.indexOf("await callVisualPlanner(");
  assert.ok(reviewer >= 0 && approved > reviewer && planner > approved, "يجب أن يأتي تخطيط المرئي بعد المراجعة والاعتماد");
});

test("v0.3.13 يختبر عقد التأليف والمراجعة النحيفين في preflight", async () => {
  const { readFile } = await import("node:fs/promises");
  const worker = await readFile(new URL("../supabase/functions/assessment-generation-worker/index.ts", import.meta.url), "utf8");
  assert.match(worker, /await preflightThinContracts\(requestId\)/);
  assert.match(worker, /wathiq_thin_author_contract_probe/);
  assert.match(worker, /wathiq_thin_review_contract_probe/);
  assert.match(worker, /providerProtocolVersion:\s*3/);
  assert.match(worker, /thinItemContractVersion:\s*1/);
});
