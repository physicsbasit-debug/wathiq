import { assertWathiqPatchAtLeast } from "./version-assertions.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildAssessmentBlueprint,
  buildAssessmentItemContracts,
} from "../dist/assets/assessment-engine/index.js";
import { AssessmentGenerationJobService } from "../dist/assets/assessment-generation-jobs.js";

const text = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const sourceA = {
  sourceId: "source-1",
  sourceTitle: "كتاب الطالب",
  sourceKind: "كتاب الطالب",
  sourceReferenceId: "ref-1",
  chunkIndex: 17,
  pageFrom: 24,
  pageTo: 25,
  contentHash: "a".repeat(64),
  extractionVersion: "google-vision-v1",
};
const sourceB = {
  sourceId: "source-1",
  sourceTitle: "كتاب الطالب",
  sourceKind: "كتاب الطالب",
  sourceReferenceId: "ref-2",
  chunkIndex: 18,
  pageFrom: 26,
  pageTo: 27,
  contentHash: "b".repeat(64),
  extractionVersion: "google-vision-v1",
};
const seeds = [
  {
    planItemId: "plan-1",
    lessonId: "lesson-1",
    lessonLabel: "عزم القوة",
    outcomeId: "outcome-1",
    outcomeLabel: "يفسر أثر موضع القوة",
    questionType: "اختيار من متعدد",
    cognitiveLevel: "تطبيق",
    difficultyLevel: "متوسط",
    marks: 1,
    sourceReferenceId: "ref-1",
    styleTarget: "سياقي",
    visualTarget: "context_scene",
    scenarioTarget: "door_handle",
    stimulusTarget: "real_life_scene",
    skillTarget: "apply",
    diversityKey: "door|apply|1",
    scientificContractKey: "moment",
    scientificRequirements: ["محور الدوران", "موضع تأثير القوة", "ذراع القوة"],
  },
  {
    planItemId: "plan-2",
    lessonId: "lesson-2",
    lessonLabel: "اتزان العزوم",
    outcomeId: "outcome-2",
    outcomeLabel: "يحسب عزم قوة",
    questionType: "إجابة قصيرة",
    cognitiveLevel: "استدلال",
    marks: 2,
    sourceReferenceId: "ref-2",
    styleTarget: "حسابي",
    visualTarget: "force_diagram",
    scenarioTarget: "wrench_tool",
    stimulusTarget: "scientific_diagram",
    skillTarget: "calculate",
    diversityKey: "wrench|calculate|2",
    scientificContractKey: "moment",
    scientificRequirements: ["القوة", "المسافة العمودية", "وحدة العزم"],
  },
];

async function generationPayload() {
  const blueprint = await buildAssessmentBlueprint({
    draftId: "draft-d2",
    generationEpoch: 2,
    assessmentType: "اختبار قصير رسمي",
    assessmentPolicyId: "oman-science-2025-2026",
    grade: 10,
    subject: "الفيزياء",
    topic: "عزم القوة",
    difficulty: "متوسط",
    items: seeds,
    sourcesByReferenceId: new Map([["ref-1", sourceA], ["ref-2", sourceB]]),
  });
  return { blueprint, contracts: await buildAssessmentItemContracts(blueprint) };
}

function runSnapshot(planHash, sourceSnapshotHash, status = "queued") {
  return {
    id: "123e4567-e89b-42d3-a456-426614174000",
    draftId: "draft-d2",
    generationEpoch: 2,
    planHash,
    sourceSnapshotHash,
    status,
    totalItems: 2,
    completedItems: status === "reviewing" ? 2 : 0,
    failedItems: 0,
    items: [1, 2].map((number) => ({
      id: `123e4567-e89b-42d3-a456-${String(426614174000 + number).padStart(12, "0")}`,
      runId: "123e4567-e89b-42d3-a456-426614174000",
      planItemId: `plan-${number}`,
      contractHash: (number === 1 ? "c" : "d").repeat(64),
      status: status === "reviewing" ? "ready" : "queued",
      attemptCount: status === "reviewing" ? 1 : 0,
      maxAttempts: 3,
      errorCode: "",
      errorMessage: "",
      stageTimings: { groundingMs: 0, modelMs: 0, normalizationMs: 0, validationMs: 0, totalMs: 0 },
      ...(status === "reviewing" ? {
        result: {
          planItemId: `plan-${number}`,
          contractHash: (number === 1 ? "c" : "d").repeat(64),
          content: { stimulus: "", text: "سؤال", options: [], answer: "إجابة", rationale: "تفسير", markScheme: ["نقطة"], needsReview: false },
          evidence: { evidenceIndex: 0, evidenceHash: "e".repeat(64), excerpt: "دليل", score: 1 },
          visual: { type: "none" },
          model: "model-test",
          generatedAt: "2026-08-03T18:00:00.000Z",
          requestId: `request-${number}`,
          durationMs: 100,
        },
      } : {}),
      startedAt: status === "reviewing" ? "2026-08-03T18:00:00.000Z" : "",
      completedAt: status === "reviewing" ? "2026-08-03T18:00:01.000Z" : "",
      updatedAt: "2026-08-03T18:00:01.000Z",
    })),
    startedAt: status === "reviewing" ? "2026-08-03T18:00:00.000Z" : "",
    completedAt: "",
    updatedAt: "2026-08-03T18:00:01.000Z",
  };
}

test("ينشئ SQL دورات ومهام دائمة دون تخزين نص الكتاب أو فتح الجداول للمتصفح", async () => {
  const sql = await text("supabase/phase_2_d2_assessment_generation_jobs.sql");
  assert.match(sql, /create table if not exists public\.assessment_generation_runs/);
  assert.match(sql, /create table if not exists public\.assessment_generation_items/);
  assert.match(sql, /unique \(owner_id, draft_id, generation_epoch\)/);
  assert.match(sql, /unique \(id, owner_id, draft_id, generation_epoch, plan_hash\)/);
  assert.match(sql, /unique \(run_id, item_order\)/);
  assert.match(sql, /foreign key \(run_id, owner_id, draft_id, generation_epoch, plan_hash\)/);
  assert.match(sql, /source_id text not null/);
  assert.match(sql, /chunk_index integer not null/);
  assert.match(sql, /source_content_hash text not null/);
  assert.doesNotMatch(sql, /source_content\s+text|book_content\s+text|reference_content\s+text/i);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /force row level security/);
  assert.match(sql, /revoke all on table public\.assessment_generation_runs from public, anon, authenticated/);
  assert.match(sql, /revoke all on table public\.assessment_generation_items from public, anon, authenticated/);
  assert.match(sql, /grant all on table public\.assessment_generation_runs to service_role/);
});

test("يجعل إدخال الدورة ذريًا ومتكررًا بأمان ويمنع الإزاحة القديمة", async () => {
  const sql = await text("supabase/phase_2_d2_assessment_generation_jobs.sql");
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /GENERATION_EPOCH_CONFLICT/);
  assert.match(sql, /STALE_GENERATION_EPOCH/);
  assert.match(sql, /status = 'superseded'/);
  assert.match(sql, /SUPERSEDED_BY_NEW_RUN/);
  assert.match(sql, /superseded_run\.status = 'superseded'/);
  assert.match(sql, /return query select v_existing\.id, false/);
  assert.match(sql, /DUPLICATE_OR_MISSING_PLAN_ITEMS/);
});

test("يطبق حجزًا ذريًا ونبضًا واستعادة ويمنع العامل القديم من كتابة النتيجة", async () => {
  const sql = await text("supabase/phase_2_d2_assessment_generation_jobs.sql");
  assert.match(sql, /claim_assessment_generation_item/);
  assert.match(sql, /for update of item skip locked/);
  assert.match(sql, /lease_token uuid/);
  assert.match(sql, /lease_expires_at > now\(\)/);
  assert.match(sql, /heartbeat_assessment_generation_item/);
  assert.match(sql, /recover_stale_assessment_generation_items/);
  assert.match(sql, /STALE_WORKER_RECOVERED/);
  assert.match(sql, /complete_assessment_generation_item/);
  assert.match(sql, /item\.generation_epoch = p_generation_epoch/);
  assert.match(sql, /item\.contract_hash = lower\(p_contract_hash\)/);
  assert.match(sql, /item\.lease_token = p_lease_token/);
  assert.match(sql, /return false; end if/);
});

test("يقيد المحاولات حسب فئة الخطأ ولا يعيد مفردة ناجحة", async () => {
  const sql = await text("supabase/phase_2_d2_assessment_generation_jobs.sql");
  assert.match(sql, /transport_retry_count integer not null default 0/);
  assert.match(sql, /content_retry_count integer not null default 0/);
  assert.match(sql, /p_retry_class not in \('none', 'transport_once', 'content_once'\)/);
  assert.match(sql, /status = 'failed'/);
  assert.match(sql, /where id = p_item_id[\s\S]*status = 'failed'[\s\S]*attempt_count < max_attempts/);
  assert.match(sql, /where run_id = p_run_id[\s\S]*status in \('queued', 'grounding', 'generating', 'normalizing', 'validating', 'retry_pending', 'failed'\)/);
  assert.doesNotMatch(sql, /where run_id = p_run_id[\s\S]*status in \([^)]*'ready'/);
});

test("تتحقق Edge Function من بصمات المخطط والعقود قبل الحفظ ولا تستدعي المحرك السابق", async () => {
  const edge = await text("supabase/functions/assessment-generation-jobs/index.ts");
  assert.match(edge, /verifyGenerationPayload/);
  assert.match(edge, /computedPlanHash !== planHash/);
  assert.match(edge, /computedSourceHash !== sourceSnapshotHash/);
  assert.match(edge, /stableStringify\(providedBase\) !== stableStringify\(expectedBase\)/);
  assert.match(edge, /sha256Hex\(expectedBase\) !== contractHash/);
  assert.match(edge, /enqueue_assessment_generation_run/);
  assert.match(edge, /recover_stale_assessment_generation_items/);
  assert.match(edge, /retry_assessment_generation_item/);
  assert.match(edge, /cancel_assessment_generation_run/);
  assert.match(edge, /resume_assessment_generation_run/);
  assert.doesNotMatch(edge, /generate-source-questions|generateWholeExam|scopedGenerationRequest|Gemini|GEMINI_API_KEY/);
  assert.doesNotMatch(edge, /access_token\s*:|request_payload/);
});

test("يرسل العميل المخطط والعقود إلى الوظيفة الجديدة ويقرأ حالة الدورة الدائمة", async () => {
  const { blueprint, contracts } = await generationPayload();
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url: String(url), init, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({
      run: runSnapshot(blueprint.planHash, blueprint.sourceSnapshotHash),
      created: true,
      requestId: "request-d2",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const service = new AssessmentGenerationJobService(
    { supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "sb_publishable_test", googleOAuthClientId: "" },
    async () => ({ accessToken: "owner-token" }),
    fetcher,
  );
  const response = await service.enqueue(blueprint, contracts);
  assert.equal(response.created, true);
  assert.equal(response.run.status, "queued");
  assert.equal(response.run.items.length, 2);
  assert.match(calls[0].url, /assessment-generation-jobs$/);
  assert.equal(calls[0].init.headers.Authorization, "Bearer owner-token");
  assert.equal(calls[0].body.action, "enqueue");
  assert.equal(calls[0].body.contracts[0].source.chunkIndex, 17);
  assert.equal(Object.hasOwn(calls[0].body.contracts[0].source, "content"), false);
});

test("يدعم العميل الاستعادة والإلغاء وإعادة المفردة ويرتبط بواجهة D4", async () => {
  const { blueprint } = await generationPayload();
  const actions = [];
  const fetcher = async (_url, init) => {
    const body = JSON.parse(init.body);
    actions.push(body);
    return new Response(JSON.stringify({
      run: runSnapshot(blueprint.planHash, blueprint.sourceSnapshotHash),
      requestId: "request-d2",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const service = new AssessmentGenerationJobService(
    { supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "key", googleOAuthClientId: "" },
    async () => ({ accessToken: "token" }),
    fetcher,
  );
  await service.list("draft-d2");
  await service.resumeRun("123e4567-e89b-42d3-a456-426614174000");
  await service.retryItem("123e4567-e89b-42d3-a456-426614174001");
  await service.cancelRun("123e4567-e89b-42d3-a456-426614174000");
  assert.deepEqual(actions.map((entry) => entry.action), ["list", "resume", "retry", "cancel"]);
  const app = await text("src/app.ts");
  assert.match(app, /AssessmentGenerationJobService/);
  assert.match(app, /assessmentGenerationJobService/);
  assert.match(app, /cancelProgressiveGeneration/);
  assert.match(app, /retryGenerationItem/);
});

test("يرفض عميل D2 نتيجة ready ناقصة بدل تمريرها للمسودة", async () => {
  const { blueprint } = await generationPayload();
  const invalid = runSnapshot(blueprint.planHash, blueprint.sourceSnapshotHash, "reviewing");
  delete invalid.items[0].result;
  const service = new AssessmentGenerationJobService(
    { supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "key", googleOAuthClientId: "" },
    async () => ({ accessToken: "token" }),
    async () => new Response(JSON.stringify({ run: invalid }), { status: 200, headers: { "Content-Type": "application/json" } }),
  );
  await assert.rejects(() => service.list("draft-d2"), /استجابة دورة توليد الاختبار غير صالحة/);
});


test("يوفر اختبار قبول بعد النشر داخل معاملة قابلة للتراجع", async () => {
  const acceptance = await text("supabase/phase_2_d2_post_deploy_acceptance.sql");
  assert.match(acceptance, /^begin;/m);
  assert.match(acceptance, /rollback;/);
  assert.match(acceptance, /PHASE_2_D2_IDEMPOTENCY_FAILED/);
  assert.match(acceptance, /PHASE_2_D2_STALE_LEASE_WAS_ACCEPTED/);
  assert.match(acceptance, /PHASE_2_D2_STALE_RECOVERY_COUNT_INVALID/);
  assert.match(acceptance, /PHASE_2_D2_RETRY_LIMIT_NOT_ENFORCED/);
  assert.match(acceptance, /PASS: Phase 2-D2 durable generation schema/);
});

test("يسجل وظيفة مهام التوليد الجديدة في إعدادات Supabase دون فتح JWT ضمنيًا", async () => {
  const config = await text("supabase/config.toml");
  assert.match(config, /\[functions\.assessment-generation-jobs\]\s*verify_jwt = false/);
  const edge = await text("supabase/functions/assessment-generation-jobs/index.ts");
  assert.match(edge, /requireUser\(req\)/);
  assert.match(edge, /admin\.auth\.getUser\(accessToken\)/);
});

test("تعلن الحزمة Phase 2-D2 دون تغيير إصدار عقود النواة أو تشغيل Gemini", async () => {
  const packageJson = JSON.parse(await text("package.json"));
  const contracts = await text("src/assessment-engine/contracts.ts");
  assertWathiqPatchAtLeast(packageJson.version, 64);
  assert.match(contracts, /ASSESSMENT_ENGINE_SCHEMA_VERSION = 1/);
  assert.match(contracts, /ASSESSMENT_CONTRACT_VERSION = 1/);
  assert.match(contracts, /ASSESSMENT_BLUEPRINT_VERSION = 1/);
});
