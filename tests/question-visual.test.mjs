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
    altText: "مشهد علمي سياقي لا يحمل بيانات كمية حاكمة",
    purpose: "توضيح السياق",
    labels: [], values: [], components: [], annotations: [], vectors: [],
    ...extra,
  };
}

function forceVisual() {
  return {
    ...emptyQuestionVisualSpec(),
    type: "force_diagram",
    visualId: "visual-force",
    title: "القوى المؤثرة على العربة",
    altText: "مخطط قوى يوضح قوة الدفع إلى الأعلى والوزن إلى الأسفل بالقيم المعطاة",
    purpose: "تمثيل اتجاهات القوى وقيمها",
    annotations: ["مخطط قوى مبسط"],
    vectors: [
      { label: "قوة الدفع", x: 50, y: 50, dx: 0, dy: 1, magnitude: 25000, unit: "N" },
      { label: "الوزن", x: 50, y: 50, dx: 0, dy: -1, magnitude: 15000, unit: "N" },
    ],
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

test("يبقى جدول البيانات وتدريج القياس حتميين ولا يتحولان إلى صورة حرة", () => {
  const table = parseQuestionVisualSpec({
    ...emptyQuestionVisualSpec(), type: "data_table", title: "نتائج تجربة", altText: "جدول قراءات",
    tableColumns: ["الزمن", "المسافة"], tableRows: ["1", "2"], tableCells: [["0", "0"], ["1", "2"]], hiddenCells: [],
  }, "data_table");
  const scale = parseQuestionVisualSpec({
    ...emptyQuestionVisualSpec(), type: "instrument_scale", title: "ميزان حرارة", altText: "تدريج حرارة", values: [-10, 100, 10, 40],
  }, "instrument_scale");
  assert.equal(questionVisualExternalAsset(table).needed, false);
  assert.equal(questionVisualExternalAsset(scale).needed, false);
  assert.match(renderQuestionVisualSvg(table), /question-visual-structured/);
  assert.match(renderQuestionVisualSvg(scale), /question-visual-structured-exact/);
});

test("مخطط القوى العلمي يرسم حتميًا بالقيم والوحدات ولا يذهب إلى نموذج الصور", () => {
  const visual = parseQuestionVisualSpec(forceVisual(), "force_diagram");
  assert.equal(isAiIllustrationEligible(visual), false);
  assert.deepEqual(questionVisualExternalAsset(visual), {
    needed: false, mode: null, assetKind: null,
  });
  const html = renderQuestionVisualSvg(visual);
  assert.match(html, /قوة الدفع/);
  assert.match(html, /25000 N/);
  assert.match(html, /الوزن/);
  assert.match(html, /15000 N/);
  assert.match(html, /qv-semantic-arrow/);
  assert.doesNotMatch(html, /2d-requested/);
  assert.match(renderQuestionVisualForPaper(visual), /25000 N/);
});

test("المخططات الدلالية الحساسة علميًا لا تعتمد صورة حرة", () => {
  const cases = [
    { ...emptyQuestionVisualSpec(), type: "flow_diagram", title: "تسلسل", altText: "تسلسل", labels: ["بداية", "تحول", "ناتج"] },
    { ...emptyQuestionVisualSpec(), type: "electrostatic_diagram", title: "شحنات", altText: "جسمان مشحونان", labels: ["A", "B"], annotations: ["+", "-"] },
    { ...emptyQuestionVisualSpec(), type: "ray_diagram", title: "أشعة", altText: "مسار شعاع", vectors: [{ label: "شعاع", x: 10, y: 50, dx: 1, dy: 0, magnitude: 1, unit: "" }] },
    { ...emptyQuestionVisualSpec(), type: "circuit_diagram", title: "دائرة", altText: "دائرة كهربائية", components: ["battery", "lamp"] },
    { ...emptyQuestionVisualSpec(), type: "pressure_diagram", title: "ضغط", altText: "موضعان في سائل", labels: ["A", "B"], values: [1, 2] },
  ];
  for (const raw of cases) {
    const visual = parseQuestionVisualSpec(raw, raw.type);
    assert.equal(isAiIllustrationEligible(visual), false, raw.type);
    assert.equal(questionVisualExternalAsset(visual).needed, false, raw.type);
    assert.match(renderQuestionVisualSvg(visual), /question-visual-structured-exact/, raw.type);
  }
});

test("المشهد السياقي فقط يطلب أصل 2D من نموذج الصور", () => {
  const visual = parseQuestionVisualSpec(contextScene(), "context_scene");
  assert.equal(isAiIllustrationEligible(visual), true);
  assert.deepEqual(questionVisualExternalAsset(visual), {
    needed: true, mode: "replace", assetKind: "scene_2d",
  });
  assert.match(renderQuestionVisualSvg(visual), /data-visual-mode="2d-requested"/);
  assert.equal(renderQuestionVisualForPaper(visual), "");
});

test("يعرض المشهد السياقي 2D المدقق بعد اعتماده", () => {
  const visual = parseQuestionVisualSpec({
    ...contextScene(),
    illustration: {
      url: "https://example.supabase.co/storage/v1/object/public/wathiq-question-visuals/user/draft/item.png",
      assetPath: "user/draft/item.png",
      mimeType: "image/png",
      model: "gemini-3.1-flash-image",
      generatedAt: "2026-08-11T00:00:00.000Z",
      promptVersion: "wathiq-context-scene-v2",
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

test("يتجاهل واثق حقل requirement القديم في المسودات المحفوظة ولا يعيده إلى العقد الحالي", () => {
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

test("يرسم واثق مسألة العزم كساق ونقطة ارتكاز وأبعاد وقوى لا كعربة عامة", () => {
  const visual = parseQuestionVisualSpec({
    ...emptyQuestionVisualSpec(),
    type: "force_diagram",
    visualId: "visual-torque",
    title: "عزم قوة حول نقطة ارتكاز",
    altText: "ساق أفقية ترتكز عند P وتؤثر قوة F عند طرفها على بعد d",
    purpose: "تمثيل موضع القوة والمسافة العمودية عن نقطة الارتكاز",
    vectors: [{ label: "F", x: 82, y: 45, dx: 0, dy: -1, magnitude: 0, unit: "" }],
    anchors: [{ kind: "pivot", label: "P", x: 25, y: 45 }],
    segments: [{ kind: "rod", label: "الساق", x1: 12, y1: 45, x2: 88, y2: 45 }],
    dimensions: [{ label: "d", value: 0, unit: "", x1: 25, y1: 67, x2: 82, y2: 67 }],
  }, "force_diagram");
  const html = renderQuestionVisualSvg(visual);
  assert.match(html, /qv-mechanics-rod/);
  assert.match(html, /qv-mechanics-pivot/);
  assert.match(html, /qv-mechanics-dimension/);
  assert.match(html, />P</);
  assert.match(html, />F</);
  assert.match(html, />d</);
  assert.doesNotMatch(html, /qv-semantic-body/);
  assert.doesNotMatch(html, /2d-requested/);
});
