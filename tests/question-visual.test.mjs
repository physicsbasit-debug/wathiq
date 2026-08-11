import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyQuestionVisualSpec,
  isAiIllustrationEligible,
  parseQuestionVisualSpec,
  questionVisualAssetRequirement,
  renderQuestionVisualForPaper,
  renderQuestionVisualSvg,
  stripQuestionVisualIllustration,
} from "../dist/assets/question-visual.js";

function lineVisual() {
  return {
    ...emptyQuestionVisualSpec(),
    type: "line_graph",
    requirement: "required",
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

function illustrated(type, extra = {}) {
  return {
    ...emptyQuestionVisualSpec(),
    type,
    requirement: "required",
    visualId: `visual-${type}`,
    title: "رسم علمي",
    altText: "أصل علمي يوضح المفهوم دون كشف الإجابة",
    purpose: "توضيح المفهوم",
    labels: ["العنصر الأول", "العنصر الثاني", "العنصر الثالث"],
    values: [0.6, 0.4, 1, 40],
    components: ["battery", "lamp"],
    vectors: [
      { label: "قوة 1", x: 0, y: 0, dx: 1, dy: 0, magnitude: 1 },
      { label: "قوة 2", x: 0, y: 0, dx: -1, dy: 0, magnitude: 1 },
    ],
    ...extra,
  };
}

test("تبقى الرسوم البيانية العددية حتمية لأن واثق يملك قيمها الدقيقة", () => {
  const visual = parseQuestionVisualSpec(lineVisual(), "line_graph");
  assert.equal(isAiIllustrationEligible(visual), false);
  assert.equal(questionVisualAssetRequirement(visual).required, false);
  assert.equal(questionVisualAssetRequirement(visual).desired, false);
  const html = renderQuestionVisualSvg(visual);
  assert.match(html, /<svg/);
  assert.match(html, /polyline/);
  assert.match(html, /الزمن \(s\)/);
});

test("يبقى جدول البيانات وتدريج القياس حتميين ولا يتحولان إلى صورة حرة", () => {
  const table = parseQuestionVisualSpec({
    ...emptyQuestionVisualSpec(), type: "data_table", requirement: "required", title: "نتائج تجربة", altText: "جدول قراءات",
    tableColumns: ["الزمن", "المسافة"], tableRows: ["1", "2"], tableCells: [["0", "0"], ["1", "2"]], hiddenCells: [],
  }, "data_table");
  const scale = parseQuestionVisualSpec({
    ...emptyQuestionVisualSpec(), type: "instrument_scale", requirement: "required", title: "ميزان حرارة", altText: "تدريج حرارة", values: [-10, 100, 10, 40],
  }, "instrument_scale");
  assert.equal(questionVisualAssetRequirement(table).required, false);
  assert.equal(questionVisualAssetRequirement(scale).required, false);
  assert.match(renderQuestionVisualSvg(table), /question-visual-structured/);
  assert.match(renderQuestionVisualSvg(scale), /question-visual-structured-exact/);
});

test("كل المرئيات التوضيحية تطلب أصلًا ثنائي الأبعاد ولا تعرض رسمًا خطيًا", () => {
  const cases = [
    illustrated("context_scene"),
    illustrated("pressure_diagram", { labels: ["الماء", "الجسم"], values: [0.72, 0.5] }),
    illustrated("circuit_diagram", { components: ["battery", "lamp"] }),
    illustrated("electrostatic_diagram", { labels: ["الجسم الأول", "الجسم الثاني"] }),
    illustrated("ray_diagram", { values: [40, 40] }),
    illustrated("force_diagram", {}),
    illustrated("flow_diagram", { labels: ["بداية", "تحول", "ناتج"] }),
  ];
  for (const raw of cases) {
    const visual = parseQuestionVisualSpec(raw, raw.type);
    assert.equal(isAiIllustrationEligible(visual), true, raw.type);
    assert.deepEqual(questionVisualAssetRequirement(visual), {
      level: "required",
      desired: true,
      required: true,
      mode: "replace",
      assetKind: "scene_2d",
    });
    const html = renderQuestionVisualSvg(visual);
    assert.match(html, /data-visual-mode="2d-required"/, raw.type);
    assert.match(html, /لا يوجد رسم خطي احتياطي/, raw.type);
    assert.doesNotMatch(html, /data-visual-mode="2d-vector"/, raw.type);
  }
});

test("يعرض أصل 2D المدقق كصورة نهائية بلا طبقة خطية", () => {
  const visual = parseQuestionVisualSpec({
    ...illustrated("electrostatic_diagram", { labels: ["الجسم الأول", "الجسم الثاني"] }),
    illustration: {
      url: "https://example.supabase.co/storage/v1/object/public/wathiq-question-visuals/user/draft/item.png",
      assetPath: "user/draft/item.png",
      mimeType: "image/png",
      model: "gemini-3.1-flash-image",
      generatedAt: "2026-08-11T00:00:00.000Z",
      promptVersion: "wathiq-quality-reset-2d-v1",
      validated: true,
      assetKind: "scene_2d",
      renderMode: "replace",
    },
  }, "electrostatic_diagram");
  const html = renderQuestionVisualSvg(visual);
  assert.match(html, /data-visual-mode="illustrated"/);
  assert.match(html, /question-visual-illustration/);
  assert.doesNotMatch(html, /question-visual-overlay|qv-force-arrow/);
  const stripped = stripQuestionVisualIllustration(visual);
  assert.equal(stripped.illustration, undefined);
  assert.match(renderQuestionVisualSvg(stripped), /2d-required/);
});

test("المرئي المساعد يُطلب دون أن يصبح شرط اعتماد ولا يظهر كفشل في ورقة الطالب", () => {
  const visual = parseQuestionVisualSpec({ ...illustrated("context_scene"), requirement: "helpful" }, "context_scene");
  assert.deepEqual(questionVisualAssetRequirement(visual), {
    level: "helpful",
    desired: true,
    required: false,
    mode: "replace",
    assetKind: "scene_2d",
  });
  assert.match(renderQuestionVisualSvg(visual), /2d-helpful/);
  assert.equal(renderQuestionVisualForPaper(visual), "");
});

test("ورقة الطالب لا تعرض صندوق انتظار للأصل البصري الإلزامي", () => {
  const visual = parseQuestionVisualSpec(illustrated("electrostatic_diagram"), "electrostatic_diagram");
  assert.match(renderQuestionVisualSvg(visual), /2d-required/);
  assert.equal(renderQuestionVisualForPaper(visual), "");
});

test("يهرب عناوين الرسوم الحتمية ولا يسمح بحقن SVG خام", () => {
  const visual = lineVisual();
  visual.title = "<script>alert(1)</script>";
  const html = renderQuestionVisualSvg(parseQuestionVisualSpec(visual, "line_graph"));
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});
