import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createEmptyDraft } from "../dist/assets/domain.js";
import { emptyQuestionVisualSpec } from "../dist/assets/question-visual.js";
import { VisualJobService, requiredVisualJobItems } from "../dist/assets/visual-jobs.js";

const text = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function electrostaticScientificItem() {
  return {
    version: "scientific-item-v1",
    kind: "electrostatic_system",
    phenomenon: "الشحن بالدلك",
    primaryEntity: "المسطرة البلاستيكية",
    secondaryEntity: "قطعة القماش",
    visualObject: "مسطرة بلاستيكية",
    relationship: "charge_transfer",
    primaryCharge: "negative",
    secondaryCharge: "positive",
    transferredParticle: "الإلكترونات",
    quantities: [],
    resultValue: 0,
    resultUnit: "",
    resultDirection: "none",
    expectedResult: "انتقال الإلكترونات وتكون شحنتين متعاكستين",
  };
}

function forceScientificItem() {
  return {
    version: "scientific-item-v1",
    kind: "force_system",
    phenomenon: "القوة المحصلة",
    primaryEntity: "عربة التسوق",
    secondaryEntity: "سطح أفقي",
    visualObject: "عربة تسوق",
    relationship: "resultant_force",
    primaryCharge: "unknown",
    secondaryCharge: "unknown",
    transferredParticle: "",
    quantities: [
      { kind: "applied_force", label: "الدفع", value: 8, unit: "N", direction: "right" },
      { kind: "friction_force", label: "الاحتكاك", value: 6, unit: "N", direction: "left" },
    ],
    resultValue: 2,
    resultUnit: "N",
    resultDirection: "right",
    expectedResult: "2 N إلى اليمين",
  };
}

function generatedDraft() {
  const draft = createEmptyDraft(new Date("2026-08-02T12:00:00Z"));
  draft.grade = 10;
  draft.subjectId = "physics";
  draft.plan = [
    {
      id: "P-1",
      lessonId: "L-1",
      lessonLabel: "الشحنة الكهربائية",
      outcomeId: "O-1",
      outcomeLabel: "تفسير الشحن بالدلك",
      cognitiveLevel: "تطبيق",
      questionType: "إجابة قصيرة",
      marks: 2,
      proposals: [{ id: "A", stimulus: "دلك طالب مسطرة بقطعة قماش.", text: "فسر انجذاب الورق.", answer: "انتقال إلكترونات.", sourceSupport: "الشحن بالدلك", scientificItem: electrostaticScientificItem() }],
      visual: {
        ...emptyQuestionVisualSpec(),
        type: "electrostatic_diagram",
        variant: "charge_transfer",
        role: "interpret",
        title: "شحن جسم بالدلك",
        altText: "مسطرة وقطعة قماش وقصاصات ورق",
        labels: ["المسطرة", "القماش"],
      },
    },
    {
      id: "P-2",
      lessonId: "L-2",
      lessonLabel: "القوى",
      outcomeId: "O-2",
      outcomeLabel: "حساب المحصلة",
      cognitiveLevel: "تطبيق",
      questionType: "إجابة طويلة",
      marks: 3,
      proposals: [{ id: "B", stimulus: "تؤثر قوة دفع 8 N إلى اليمين وقوة احتكاك 6 N إلى اليسار.", text: "احسب محصلة القوى.", answer: "2 N إلى اليمين", sourceSupport: "القوة المحصلة", scientificItem: forceScientificItem() }],
      visual: {
        ...emptyQuestionVisualSpec(),
        type: "force_diagram",
        variant: "free_body",
        role: "calculate",
        title: "القوى المؤثرة في عربة",
        altText: "عربة تؤثر فيها قوتان أفقيتان",
        labels: ["العربة"],
        vectors: [
          { label: "الدفع", x: 0, y: 0, dx: 80, dy: 0, magnitude: 8 },
          { label: "الاحتكاك", x: 0, y: 0, dx: -60, dy: 0, magnitude: 6 },
        ],
      },
    },
  ];
  draft.selectedProposalByPlanItem = { "P-1": "A", "P-2": "B" };
  return draft;
}

test("يبني مهمة replace للمشهد ومهمة overlay لمخطط القوى دون حد عددي مصطنع", () => {
  const items = requiredVisualJobItems(generatedDraft(), "الفيزياء");
  assert.equal(items.length, 2);
  assert.equal(items[0].requiredMode, "replace");
  assert.equal(items[1].requiredMode, "overlay");
  assert.equal(items[1].visual.illustration, undefined);
  assert.equal(items[0].scientificItem.relationship, "charge_transfer");
  assert.equal(items[1].scientificItem.quantities[0].value, 8);
});

test("يقسم VisualJobService الاختبارات الكبيرة إلى دفعات دون إسقاط أي أصل مطلوب", async () => {
  const calls = [];
  const fetcher = async (_url, init) => {
    const payload = JSON.parse(init.body);
    calls.push(payload.items.length);
    return new Response(JSON.stringify({ jobs: payload.items.map((item, index) => ({
      id: `123e4567-e89b-42d3-a456-${String(calls.length * 1000 + index).padStart(12, "0")}`,
      draftId: payload.draftId,
      planItemId: item.planItemId,
      visualHash: "a".repeat(64),
      requiredMode: item.requiredMode,
      status: "queued",
      attemptCount: 0,
      maxAttempts: 2,
      errorCode: "",
      errorMessage: "",
      startedAt: "",
      completedAt: "",
      updatedAt: "2026-08-02T12:00:00Z",
    })) }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const service = new VisualJobService(
    { supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "sb_publishable_test", googleOAuthClientId: "" },
    async () => ({ accessToken: "token" }),
    fetcher,
  );
  const items = Array.from({ length: 23 }, (_, index) => ({
    planItemId: `P-${index + 1}`,
    grade: 10,
    subject: "الفيزياء",
    lessonLabel: "القوى",
    questionText: "فسر الموقف.",
    sourceSupport: "دليل المصدر",
    previousAssetPath: "",
    requiredMode: "replace",
    visual: { type: "context_scene" },
  }));
  const jobs = await service.enqueue("draft-large", items);
  assert.deepEqual(calls, [20, 3]);
  assert.equal(jobs.length, 23);
});

test("يرسل VisualJobService الطلب إلى الوظيفة الجديدة ويقرأ الحالة الدائمة", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ jobs: [{
      id: "123e4567-e89b-42d3-a456-426614174000",
      draftId: "draft-1",
      planItemId: "P-1",
      visualHash: "a".repeat(64),
      requiredMode: "replace",
      status: "queued",
      attemptCount: 0,
      maxAttempts: 2,
      errorCode: "",
      errorMessage: "",
      startedAt: "",
      completedAt: "",
      updatedAt: "2026-08-02T12:00:00Z",
    }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const service = new VisualJobService(
    { supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "sb_publishable_test", googleOAuthClientId: "" },
    async () => ({ accessToken: "token" }),
    fetcher,
  );
  const jobs = await service.list("draft-1");
  assert.equal(jobs[0].status, "queued");
  assert.match(calls[0].url, /question-visual-jobs$/);
  assert.equal(calls[0].init.headers.Authorization, "Bearer token");
});

test("يضيف SQL جدول المهام الدائمة ويمنع وصول المتصفح المباشر", async () => {
  const sql = await text("supabase/phase_2_c3_visual_asset_jobs.sql");
  assert.match(sql, /create table if not exists public\.question_visual_jobs/);
  assert.match(sql, /status in \('queued', 'generating', 'validating', 'ready', 'retry_pending', 'failed', 'cancelled'\)/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.question_visual_jobs from anon, authenticated/);
});

test("تشغل Edge Function المهمة في الخلفية وتستعيد العامل المتوقف", async () => {
  const edge = await text("supabase/functions/question-visual-jobs/index.ts");
  assert.match(edge, /EdgeRuntime\?\.waitUntil/);
  assert.match(edge, /recoverStaleJobs/);
  assert.match(edge, /STALE_WORKER_RECOVERED/);
  assert.match(edge, /generate-source-questions/);
  assert.match(edge, /status: "ready"/);
  assert.match(edge, /retry_pending/);
  assert.match(edge, /previousAssetPath = row\.asset\?\.assetPath/);
  assert.match(edge, /response\.illustration\.renderMode !== row\.required_mode/);
  assert.match(edge, /apikey: SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edge, /existing\?\.asset\?\.assetPath/);
  assert.match(edge, /wathiq_visual_job_superseded/);
  assert.match(edge, /QUESTION_VISUAL_BUCKET/);
});

test("يمنع التطبيق الاعتماد والتصدير قبل اكتمال الأصول المطلوبة", async () => {
  const app = await text("src/app.ts");
  assert.match(app, /requiredVisualsReady/);
  assert.match(app, /الأصول البصرية المطلوبة/);
  assert.match(app, /لا يمكن التصدير قبل اكتمال الأصول البصرية/);
  assert.match(app, /يستمر تنفيذها حتى لو غادرت الصفحة/);
  assert.match(app, /invalidateVisualJobForPlanItem/);
  assert.match(app, /verifyRequiredVisualAssetsForExport/);
  assert.match(app, /job\.asset\?\.assetPath === illustration\?\.assetPath/);
});
