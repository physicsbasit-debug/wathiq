import assert from "node:assert/strict";
import test from "node:test";
import { visualJobItems, VisualJobService } from "../dist/assets/visual-jobs.js";

function draftWithVisual(type, extra = {}) {
  return {
    id: "draft-1", programmeId: "igcse", syllabusCode: "0625", grade: null,
    selectedProposalByPlanItem: { p1: "q1" },
    plan: [{
      id: "p1", lessonLabel: "القوى والحركة",
      visual: { type, visualId: "v1", purpose: "توضيح", title: "مرئي", altText: "مرئي علمي", xAxisLabel: "", xAxisUnit: "", yAxisLabel: "", yAxisUnit: "", xMin: 0, xMax: 1, yMin: 0, yMax: 1, points: [], series: [], labels: [], values: [], components: [], annotations: [], tableColumns: [], tableRows: [], tableCells: [], hiddenCells: [], vectors: [], anchors: [], segments: [], dimensions: [], ...extra },
      proposals: [{ id: "q1", stimulus: "", text: "فسر العلاقة.", answer: "", reviewSupport: "سياق كامبريدج العالمي" }],
    }],
  };
}

test("كل context_scene ينشئ مهمة صورة 2D", () => {
  const items = visualJobItems(draftWithVisual("context_scene"), "الفيزياء");
  assert.equal(items.length, 1);
  assert.equal(items[0].requiredMode, "replace");
  assert.equal(items[0].programmeId, "igcse");
  assert.equal(items[0].stageLabel, "كامبريدج للشهادة الدولية العامة للتعليم الثانوي");
});

test("الرسم البياني الدقيق لا يرسل إلى نموذج الصور", () => {
  const draft = draftWithVisual("line_graph", {
    title: "الزمن والمسافة", altText: "رسم بيانات", xAxisLabel: "الزمن", yAxisLabel: "المسافة", xMin: 0, xMax: 1, yMin: 0, yMax: 2,
    points: [{ x: 0, y: 0, label: "" }, { x: 1, y: 2, label: "" }], labels: [],
  });
  assert.equal(visualJobItems(draft, "الفيزياء").length, 0);
});

test("VisualJobService يرسل المشهد 2D إلى الوظيفة الدائمة", async () => {
  const calls = [];
  const service = new VisualJobService(
    { supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "sb_publishable_test" },
    async () => ({ accessToken: "token" }),
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ jobs: [{
        id: "job-1", draftId: "draft-1", planItemId: "p1", visualHash: "h", requiredMode: "replace", status: "queued",
        attemptCount: 0, maxAttempts: 2, errorCode: "", errorMessage: "", startedAt: "", completedAt: "", updatedAt: "now",
      }] }), { status: 200 });
    },
  );
  const jobs = await service.enqueue("draft-1", visualJobItems(draftWithVisual("context_scene"), "الفيزياء"));
  assert.equal(jobs.length, 1);
  assert.match(calls[0].url, /question-visual-jobs$/);
});


test("VisualJobService لا يعتبر jobs=[] نجاحًا عندما توجد صورة مطلوبة", async () => {
  const service = new VisualJobService(
    { supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "sb_publishable_test" },
    async () => ({ accessToken: "token" }),
    async () => new Response(JSON.stringify({ jobs: [] }), { status: 200 }),
  );
  await assert.rejects(
    () => service.enqueue("draft-1", visualJobItems(draftWithVisual("context_scene"), "الفيزياء")),
    /لم تنشئ منظومة الصور 1 مهمة ثنائية الأبعاد مطلوبة/,
  );
});
