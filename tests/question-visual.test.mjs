import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyQuestionVisualSpec,
  parseQuestionVisualSpec,
  questionVisualTypeLabel,
  renderQuestionVisualSvg,
} from "../dist/assets/question-visual.js";

function lineVisual() {
  return {
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
    points: [
      { x: 0, y: 0, label: "" },
      { x: 1, y: 2, label: "" },
      { x: 2, y: 4, label: "" },
      { x: 4, y: 8, label: "" },
    ],
    labels: [],
    values: [],
    components: [],
    annotations: [],
  };
}

test("يرسم مخططًا خطيًا SVG بمحاور ووحدات واضحة", () => {
  const svg = renderQuestionVisualSvg(parseQuestionVisualSpec(lineVisual(), "line_graph"));
  assert.match(svg, /<svg/);
  assert.match(svg, /polyline/);
  assert.match(svg, /الزمن \(s\)/);
  assert.match(svg, /المسافة \(m\)/);
  assert.match(svg, /role="img"/);
});

test("يرسم أعمدة ويمنع القيم غير المتطابقة مع التسميات", () => {
  const visual = {
    ...emptyQuestionVisualSpec(),
    type: "bar_chart",
    title: "نتائج القياس",
    altText: "رسم أعمدة لثلاث نتائج",
    yAxisLabel: "الطول",
    yAxisUnit: "cm",
    yMin: 0,
    yMax: 10,
    labels: ["أ", "ب", "ج"],
    values: [4, 6, 8],
  };
  assert.match(renderQuestionVisualSvg(parseQuestionVisualSpec(visual, "bar_chart")), /qv-bar/);
  assert.throws(() => parseQuestionVisualSpec({ ...visual, values: [4] }, "bar_chart"), /قيمة لكل تسمية/);
});

test("يرسم مخطط ضغط ثنائي الأبعاد ودائرة كهربائية مبسطة", () => {
  const pressure = {
    ...emptyQuestionVisualSpec(),
    type: "pressure_diagram",
    title: "جسم داخل سائل",
    altText: "وعاء يحوي سائلا وجسما عند عمق محدد",
    labels: ["الماء", "الجسم"],
    values: [0.72, 0.55],
    annotations: ["سطح السائل"],
  };
  const circuit = {
    ...emptyQuestionVisualSpec(),
    type: "circuit_diagram",
    title: "دائرة كهربائية على التوالي",
    altText: "بطارية ومفتاح ومصباح موصلة على التوالي",
    components: ["battery", "switch_closed", "lamp"],
    annotations: ["بطارية", "مفتاح", "مصباح"],
  };
  assert.match(renderQuestionVisualSvg(parseQuestionVisualSpec(pressure, "pressure_diagram")), /qv-liquid/);
  assert.match(renderQuestionVisualSvg(parseQuestionVisualSpec(circuit, "circuit_diagram")), /qv-wire/);
  assert.equal(questionVisualTypeLabel("circuit_diagram"), "دائرة كهربائية مبسطة");
});

test("يهرب التسميات ولا يسمح بإدخال SVG خام", () => {
  const visual = lineVisual();
  visual.title = "<script>alert(1)</script>";
  const parsed = parseQuestionVisualSpec(visual, "line_graph");
  const svg = renderQuestionVisualSvg(parsed);
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;/);
});
