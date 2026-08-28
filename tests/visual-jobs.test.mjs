import assert from "node:assert/strict";
import test from "node:test";
import { visualJobItems, VisualJobService } from "../dist/assets/visual-jobs.js";
import { readFileSync } from "node:fs";

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

// Regression test for textField helper function fix
test("textField helper function is correctly defined in question-visual-jobs Edge Function", () => {
  const edgeFunctionPath = "supabase/functions/question-visual-jobs/index.ts";
  const content = readFileSync(edgeFunctionPath, "utf8");

  // Verify textField function is defined locally (not imported)
  assert.ok(
    content.includes("function textField(value: unknown): string"),
    "textField function should be defined locally in the Edge Function"
  );

  // Verify the function implementation is correct
  assert.ok(
    content.includes("return typeof value === \"string\" ? value.trim() : \"\";"),
    "textField function should trim strings and return empty string for non-strings"
  );

  // Verify there's no export of textField (to maintain encapsulation)
  assert.ok(
    !content.includes("export { textField"),
    "textField should not be exported from the Edge Function"
  );

  // Verify all three usages of textField exist
  assert.ok(
    content.split("textField(").length >= 4, // function definition + 3 usages
    "textField should be used in all three required locations"
  );

  // Verify context_scene check is present
  assert.ok(
    content.includes('textField(row.request_payload.visual.type) !== "context_scene"'),
    "context_scene check should be present in processJob"
  );

  // Verify isContextSceneJobInput uses textField
  assert.ok(
    content.includes("return textField(visual?.type) === \"context_scene\";"),
    "isContextSceneJobInput should use textField"
  );

  // Verify parseJobInput uses textField for validation
  assert.ok(
    content.includes('if (textField(visual.type) !== "context_scene") throw httpError'),
    "parseJobInput should use textField to validate visual type"
  );

  // Verify STRUCTURED_VISUAL_RENDERED_LOCALLY error path is preserved
  assert.ok(
    content.includes('error_code: "STRUCTURED_VISUAL_RENDERED_LOCALLY"'),
    "STRUCTURED_VISUAL_RENDERED_LOCALLY error path should be preserved"
  );
});