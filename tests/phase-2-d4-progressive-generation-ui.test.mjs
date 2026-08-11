import { assertWathiqPatchAtLeast } from "./version-assertions.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createEmptyDraft } from "../dist/assets/domain.js";
import { sourceContentHash } from "../dist/assets/assessment-engine/index.js";
import { buildProgressiveGenerationPayload } from "../dist/assets/assessment-generation-progressive.js";
import { ProgressiveAssessmentGenerationOrchestrator } from "../dist/assets/assessment-generation-orchestrator.js";

const text = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function progressiveDraft() {
  const draft = createEmptyDraft();
  draft.id = "draft-d4";
  draft.grade = 10;
  draft.subjectId = "physics";
  draft.topic = "عزم القوة والدوائر والبيانات";
  draft.totalMarks = 6;
  draft.generationEpoch = 4;
  draft.generationMode = "progressive_items_v1";
  draft.sourceReferences = Array.from({ length: 6 }, (_, index) => {
    const content = index === 1
      ? "يعتمد عزم القوة على محور الدوران وموضع تأثير القوة وذراع القوة، ويزداد العزم عند دفع الباب بعيدًا عن المفصلات."
      : `مقطع علمي مستقل رقم ${index + 1} يشرح بيانات الدرس ومفاهيمه وقيمه اللازمة لبناء سؤال موثق.`;
    return {
      id: `source-d4:${index}:lesson-${index + 1}`,
      sourceId: "source-d4",
      sourceTitle: "كتاب الطالب",
      sourceKind: "كتاب الطالب",
      pageFrom: 20 + index,
      pageTo: 20 + index,
      excerpt: content,
      context: content,
      lessonTopic: index === 1 ? "عزم القوة" : `الدرس ${index + 1}`,
      score: 90,
    };
  });
  draft.plan = draft.sourceReferences.map((reference, index) => ({
    id: `plan-${index + 1}`,
    lessonId: `lesson-${index + 1}`,
    lessonLabel: index === 1 ? "عزم القوة" : `الدرس ${index + 1}`,
    outcomeId: `outcome-${index + 1}`,
    outcomeLabel: index === 1 ? "يفسر أثر موضع القوة في دوران الباب" : "يطبق المفهوم العلمي في موقف جديد",
    cognitiveLevel: index < 2 ? "تطبيق" : index === 5 ? "استدلال" : "معرفة",
    questionType: "اختيار من متعدد",
    marks: 1,
    proposals: [],
    sourceReferenceId: reference.id,
  }));
  return draft;
}

const managedSource = {
  id: "source-d4",
  catalogCode: "W-D4",
  fingerprint: "source-d4-fingerprint",
  authority: "منهج عُماني",
  title: "كتاب الطالب",
  kind: "كتاب الطالب",
  mode: "file",
  grade: 10,
  subjectId: "physics",
  version: "2025/2026",
  semester: "الفصل الأول",
  rightsConfirmed: true,
  status: "مفهرس",
  drivePath: "عمان/10/فيزياء",
  createdAt: "2026-08-04T00:00:00.000Z",
  updatedAt: "2026-08-04T00:00:00.000Z",
  extractionStatus: "مكتمل",
  extractionVersion: "google-vision-v1",
};

function itemSnapshot(number, status = "queued") {
  return {
    id: `123e4567-e89b-42d3-a456-${String(426614174000 + number).padStart(12, "0")}`,
    runId: "123e4567-e89b-42d3-a456-426614174000",
    planItemId: `plan-${number}`,
    contractHash: String(number).repeat(64).slice(0, 64),
    status,
    attemptCount: status === "ready" ? 1 : 0,
    maxAttempts: 3,
    errorCode: "",
    errorMessage: "",
    stageTimings: { groundingMs: 0, modelMs: 0, normalizationMs: 0, validationMs: 0, totalMs: 0 },
    startedAt: "",
    completedAt: status === "ready" ? "2026-08-04T08:00:00.000Z" : "",
    updatedAt: "2026-08-04T08:00:00.000Z",
  };
}

function runSnapshot(itemCount = 4, firstReady = false) {
  const items = Array.from({ length: itemCount }, (_, index) => itemSnapshot(index + 1, firstReady && index === 0 ? "ready" : "queued"));
  return {
    id: "123e4567-e89b-42d3-a456-426614174000",
    draftId: "draft-d4",
    generationEpoch: 4,
    planHash: "a".repeat(64),
    sourceSnapshotHash: "b".repeat(64),
    status: "running",
    totalItems: itemCount,
    completedItems: firstReady ? 1 : 0,
    failedItems: 0,
    items,
    startedAt: "2026-08-04T08:00:00.000Z",
    completedAt: "",
    updatedAt: "2026-08-04T08:00:00.000Z",
  };
}

test("يبني D4 عقدًا ومصدرًا مستقلين لكل مفردة ويحمي مرئي العزم الضروري", async () => {
  const draft = progressiveDraft();
  const payload = await buildProgressiveGenerationPayload({ draft, subject: "الفيزياء", sources: [managedSource] });
  assert.equal(payload.contracts.length, 6);
  assert.equal(payload.blueprint.itemCount, 6);
  assert.equal(new Set(payload.contracts.map((contract) => contract.source.chunkIndex)).size, 6);
  const moment = payload.contracts.find((contract) => contract.planItemId === "plan-2");
  assert.equal(moment.scientificContractKey, "moment");
  assert.notEqual(moment.visualTarget, "none");
  assert.equal(moment.source.contentHash, await sourceContentHash(draft.sourceReferences[1].context));
  assert.ok(payload.contracts.every((contract) => !Object.hasOwn(contract.source, "content")));
});

test("يشغل المنسق مهمتين فقط بالتوازي ويحفظ الدفعات التالية دون إعادة الجاهز", async () => {
  const snapshot = runSnapshot(5, true);
  const dispatches = new Map();
  let maxActive = 0;
  const jobs = {
    enqueue: async () => ({ run: snapshot, created: true, requestId: "enqueue" }),
    list: async () => ({ run: snapshot, created: false, requestId: "list" }),
    resumeRun: async () => ({ run: snapshot, created: false, requestId: "resume" }),
    retryItem: async () => ({ run: snapshot, created: false, requestId: "retry" }),
  };
  const worker = {
    processItem: async (itemId) => {
      const item = snapshot.items.find((entry) => entry.id === itemId);
      dispatches.set(item.planItemId, (dispatches.get(item.planItemId) ?? 0) + 1);
      item.status = "generating";
      maxActive = Math.max(maxActive, snapshot.items.filter((entry) => entry.status === "generating").length);
      return { accepted: true, itemId, requestId: `worker-${itemId}` };
    },
  };
  const sleep = async () => {
    for (const item of snapshot.items) {
      if (item.status === "generating") {
        item.status = "ready";
        item.attemptCount = 1;
        item.completedAt = "2026-08-04T08:00:01.000Z";
      }
    }
    snapshot.completedItems = snapshot.items.filter((item) => item.status === "ready").length;
    snapshot.status = snapshot.completedItems === snapshot.totalItems ? "reviewing" : "running";
  };
  const orchestrator = new ProgressiveAssessmentGenerationOrchestrator(jobs, worker, {
    concurrency: 2,
    pollIntervalMs: 250,
    dispatchCooldownMs: 1_000,
    sleep,
  });
  const final = await orchestrator.resume(snapshot.draftId, snapshot.id);
  assert.equal(final.completedItems, 5);
  assert.equal(maxActive, 2);
  assert.equal(dispatches.has("plan-1"), false);
  assert.deepEqual([...dispatches.values()], [1, 1, 1, 1]);
});

test("تنتقل الواجهة إلى المراجعة قبل انتظار الشبكة وتعرض حالة كل مفردة", async () => {
  const app = await text("src/app.ts");
  const styles = await text("src/styles.css");
  assert.match(app, /setStep\(3\);[\s\S]*window\.setTimeout\(\(\) => \{\s*void generateQuestionsForPlan/);
  assert.match(app, /renderProgressiveGenerationPanel/);
  assert.match(app, /generationItemStatusLabel/);
  assert.match(app, /data-generation-retry/);
  assert.match(app, /data-generation-cancel/);
  assert.match(styles, /\.generation-progress-panel/);
  assert.match(styles, /\.generation-item-placeholder/);
});

test("يستعيد D4 الدورة بعد مزامنة المصادر ولا يعيد المفردات المكتملة", async () => {
  const app = await text("src/app.ts");
  const orchestrator = await text("src/assessment-generation-orchestrator.ts");
  assert.match(app, /draft\.generationRunId && !isPlanComplete\(draft\)/);
  assert.match(app, /loadAndSyncCentralSources[\s\S]*!isPlanComplete\(state\.draft\)[\s\S]*generateQuestionsForPlan/);
  assert.match(app, /assessmentGenerationJobService\.list\(draftId, state\.draft\.generationRunId\)/);
  assert.match(orchestrator, /snapshot\.items\.every\(\(item\) => item\.status === "ready"\)/);
  assert.match(orchestrator, /DISPATCHABLE_ITEM_STATUSES/);
});

test("يحفظ التخزين معرف الدورة والإزاحة ويرفض رجوع واجهة الإنتاج للمحرك السابق", async () => {
  const types = await text("src/types.ts");
  const storage = await text("src/storage.ts");
  const app = await text("src/app.ts");
  assert.match(types, /generationRunId: string/);
  assert.match(types, /generationEpoch: number/);
  assert.match(storage, /generationRunId/);
  assert.match(storage, /generationEpoch/);
  assert.match(app, /generationMode = "progressive_items_v1"/);
  assert.doesNotMatch(app, /generateWholeExam/);
  assert.doesNotMatch(app, /new QuestionGenerationService/);
  assert.doesNotMatch(app, /state\.draft\.generationMode = "legacy_items"/);
});

test("يثبت D4 ويطلق أصول 2D تدريجيًا دون إدخال الصور في المسار الحرج لعامل السؤال", async () => {
  const pkg = JSON.parse(await text("package.json"));
  const app = await text("src/app.ts");
  const orchestrator = await text("src/assessment-generation-orchestrator.ts");
  assertWathiqPatchAtLeast(pkg.version, 66);
  assert.match(orchestrator, /concurrency \?\? 2/);
  assert.match(app, /applyProgressiveGenerationSnapshot\(snapshot, payload\);\s*scheduleRequiredVisualJobSync\(\);/);
  assert.match(app, /void syncVisualJobs\(true\)/);
  assert.doesNotMatch(orchestrator, /question-visual-jobs|VisualJobService/);
});


test("يفحص D4 صحة عامل المفردة قبل إنشاء الدورة ويوقف المنسق عند الخروج والحذف", async () => {
  const app = await text("src/app.ts");
  assert.match(app, /await assessmentGenerationWorkerService\.health\(\)/);
  assert.match(app, /engineSchemaVersion !== 1 \|\| workerHealth\.contractVersion !== 1/);
  assert.match(app, /async function signOutOwner[\s\S]*assessmentGenerationOrchestrator\?\.stop\(\)/);
  assert.match(app, /action === "delete-draft"[\s\S]*assessmentGenerationOrchestrator\?\.stop\(\)/);
});

test("يحافظ منسق D4 على مهلة التهدئة بعد خطأ اتصال العامل بدل حلقة استدعاء سريعة", async () => {
  const orchestrator = await text("src/assessment-generation-orchestrator.ts");
  const catchBlock = orchestrator.match(/catch \(error\) \{[\s\S]*?hooks\.onWorkerError\?\.\(item\.id, error\);[\s\S]*?\}/)?.[0] ?? "";
  assert.doesNotMatch(catchBlock, /dispatchedAt\.delete\(item\.id\)/);
  assert.match(orchestrator, /dispatchCooldownMs/);
});
