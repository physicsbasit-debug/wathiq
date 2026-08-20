import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyQuestionVisualSpec,
  isAiIllustrationEligible,
  parseQuestionVisualSpec,
  questionVisualExternalAsset,
  renderQuestionVisualForPaper,
  renderQuestionVisualSvg,
  stripQuestionVisualIllustration,
} from "../dist/assets/question-visual.js";

function lineVisual() {
  return {
    ...emptyQuestionVisualSpec(),
    type: "line_graph",
    title: "المسافة والزمن",
    altText: "رسم خطي يوضح تغير المسافة مع الزمن",
    xAxisLabel: "الزمن",
    xAxisUnit: "s",
    yAxisLabel: "المسافة",
    yAxisUnit: "m",
    xMin: 0,
    xMax: 4,
    yMin: 0,
    yMax: 8,
    points: [{ x: 0, y: 0, label: "" }, { x: 1, y: 2, label: "" }, { x: 2, y: 4, label: "" }, { x: 4, y: 8, label: "" }],
  };
}

function contextScene(extra = {}) {
  return {
    ...emptyQuestionVisualSpec(),
    type: "context_scene",
    visualId: "visual-scene",
    title: "مشهد علمي",
    altText: "مشهد علمي ثنائي الأبعاد",
    purpose: "توضيح السياق العلمي دون كشف الإجابة",
    ...extra,
  };
}

test("تبقى الرسوم البيانية العددية حتمية لأن واثق يملك قيمها الدقيقة", () => {
  const visual = parseQuestionVisualSpec(lineVisual(), "line_graph");
  assert.equal(isAiIllustrationEligible(visual), false);
  assert.equal(questionVisualExternalAsset(visual).needed, false);
  const html = renderQuestionVisualSvg(visual);
  assert.match(html, /<svg/);
  assert.match(html, /polyline/);
  assert.match(html, /الزمن \(s\)/);
});

test("يبقى جدول البيانات ورسم الأعمدة حتميين ولا يتحولان إلى صورة حرة", () => {
  const table = parseQuestionVisualSpec({
    ...emptyQuestionVisualSpec(), type: "data_table", title: "نتائج تجربة", altText: "جدول قراءات",
    tableColumns: ["الزمن", "المسافة"], tableRows: ["1", "2"], tableCells: [["0", "0"], ["1", "2"]], hiddenCells: [],
  }, "data_table");
  const bars = parseQuestionVisualSpec({
    ...emptyQuestionVisualSpec(), type: "bar_chart", title: "مقارنة", altText: "رسم أعمدة",
    yAxisLabel: "القيمة", yMin: 0, yMax: 10, labels: ["أ", "ب"], values: [4, 8],
  }, "bar_chart");
  assert.equal(questionVisualExternalAsset(table).needed, false);
  assert.equal(questionVisualExternalAsset(bars).needed, false);
  assert.match(renderQuestionVisualSvg(table), /qv-data-table/);
  assert.match(renderQuestionVisualSvg(bars), /<svg/);
});

test("كل مشهد علمي غير عددي يطلب أصل 2D مدقق ولا يملك رسماً خطياً احتياطياً", () => {
  const visual = parseQuestionVisualSpec(contextScene(), "context_scene");
  assert.equal(isAiIllustrationEligible(visual), true);
  assert.deepEqual(questionVisualExternalAsset(visual), {
    needed: true, mode: "replace", assetKind: "scene_2d",
  });
  const html = renderQuestionVisualSvg(visual);
  assert.match(html, /data-visual-mode="2d-requested"/);
  assert.match(html, /لا يوجد مولد تخطيطي أو رسم خطي احتياطي/);
  assert.equal(renderQuestionVisualForPaper(visual), "");
});

test("يعرض الأصل 2D المدقق بعد اعتماده", () => {
  const visual = parseQuestionVisualSpec({
    ...contextScene(),
    illustration: {
      url: "https://example.supabase.co/storage/v1/object/public/wathiq-question-visuals/user/draft/item.png",
      assetPath: "user/draft/item.png",
      mimeType: "image/png",
      model: "gemini-3.1-flash-image",
      generatedAt: "2026-08-20T00:00:00.000Z",
      promptVersion: "wathiq-science-2d-reset-v3",
      validated: true,
      assetKind: "scene_2d",
      renderMode: "replace",
    },
  }, "context_scene");
  const html = renderQuestionVisualSvg(visual);
  assert.match(html, /data-visual-mode="illustrated"/);
  assert.match(html, /question-visual-illustration/);
  const stripped = stripQuestionVisualIllustration(visual);
  assert.equal(stripped.illustration, undefined);
  assert.match(renderQuestionVisualSvg(stripped), /2d-requested/);
});

test("المسودات القديمة ذات المخططات الخطية تهاجر للقراءة إلى context_scene ولا يعاد رسمها", () => {
  for (const oldType of ["force_diagram", "circuit_diagram", "electrostatic_diagram", "ray_diagram", "pressure_diagram", "flow_diagram", "instrument_scale"]) {
    const visual = parseQuestionVisualSpec({
      ...emptyQuestionVisualSpec(),
      type: oldType,
      visualId: `old-${oldType}`,
      title: "مرئي قديم",
      altText: "مرئي علمي قديم يجب تحويله إلى صورة ثنائية الأبعاد",
      purpose: "توضيح علمي",
      vectors: [{ label: "F", x: 50, y: 50, dx: 1, dy: 0, magnitude: 10, unit: "N" }],
      components: ["battery", "lamp"],
      values: [0, 10, 1, 5],
    });
    assert.equal(visual.type, "context_scene", oldType);
    assert.equal(questionVisualExternalAsset(visual).needed, true, oldType);
    assert.equal("vectors" in visual, false, oldType);
    assert.equal("components" in visual, false, oldType);
    assert.equal("anchors" in visual, false, oldType);
    assert.equal("segments" in visual, false, oldType);
    assert.equal("dimensions" in visual, false, oldType);
  }
});

test("يتجاهل واثق حقل requirement القديم في المسودات المحفوظة", () => {
  const raw = { ...contextScene(), requirement: "helpful" };
  const visual = parseQuestionVisualSpec(raw, "context_scene");
  assert.equal("requirement" in visual, false);
  assert.equal(questionVisualExternalAsset(visual).needed, true);
});

test("يهرب عناوين الرسوم الحتمية ولا يسمح بحقن SVG خام", () => {
  const visual = lineVisual();
  visual.title = "<script>alert(1)</script>";
  const html = renderQuestionVisualSvg(parseQuestionVisualSpec(visual, "line_graph"));
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});
