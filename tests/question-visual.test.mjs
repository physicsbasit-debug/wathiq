import test from "node:test";
import assert from "node:assert/strict";
import {
  diversifyQuestionVisualSpec,
  emptyQuestionVisualSpec,
  isAiIllustrationEligible,
  parseQuestionVisualIllustration,
  parseQuestionVisualSpec,
  questionVisualTypeLabel,
  renderQuestionVisualSvg,
  stripQuestionVisualIllustration,
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


test("ينوّع الرسومات الحتمية بين المفردات ولا يعيد الصورة نفسها", () => {
  const base = {
    ...emptyQuestionVisualSpec(),
    type: "pressure_diagram",
    title: "الضغط في السوائل",
    altText: "مخطط ضغط تعليمي",
    labels: ["الماء", "الجسم"],
    values: [0.72, 0.4, 0.75],
  };
  const first = diversifyQuestionVisualSpec(base, 0, "item-1");
  const second = diversifyQuestionVisualSpec(base, 1, "item-2");
  const third = diversifyQuestionVisualSpec(base, 2, "item-3");
  assert.notEqual(first.visualId, second.visualId);
  assert.notEqual(first.variant, second.variant);
  assert.notEqual(renderQuestionVisualSvg(first), renderQuestionVisualSvg(second));
  assert.match(renderQuestionVisualSvg(third), /مساحة التلامس A|القوة F/);
});

test("يرسم مخطط كهرباء ساكنة دون صور حرة", () => {
  const electrostatic = {
    ...emptyQuestionVisualSpec(),
    type: "electrostatic_diagram",
    variant: "charge_transfer",
    title: "شحن مسطرة بالدلك",
    altText: "مسطرة بلاستيكية تدلك بقطعة قماش ثم تقرب من قصاصات ورق",
    labels: ["المسطرة البلاستيكية", "قطعة القماش"],
    values: [1],
    annotations: ["اتجاه الدلك"],
  };
  const svg = renderQuestionVisualSvg(parseQuestionVisualSpec(electrostatic, "electrostatic_diagram"));
  assert.match(svg, /qv-rod/);
  assert.match(svg, /qv-paper-piece/);
  assert.match(svg, /اتجاه الدلك/);
  assert.equal(questionVisualTypeLabel("electrostatic_diagram"), "مخطط كهرباء ساكنة ثنائي الأبعاد");
});

test("يرسم منحنيين للمقارنة مع مفتاح واضح", () => {
  const visual = {
    ...emptyQuestionVisualSpec(),
    type: "line_graph",
    variant: "multi_series",
    title: "مقارنة منحنيين",
    altText: "رسم خطي يقارن حالتين",
    xAxisLabel: "الزمن",
    xAxisUnit: "s",
    yAxisLabel: "درجة الحرارة",
    yAxisUnit: "°C",
    xMin: 0,
    xMax: 3,
    yMin: 0,
    yMax: 60,
    series: [
      { label: "العينة أ", points: [{ x: 0, y: 20, label: "" }, { x: 1, y: 30, label: "" }, { x: 2, y: 40, label: "" }] },
      { label: "العينة ب", points: [{ x: 0, y: 20, label: "" }, { x: 1, y: 26, label: "" }, { x: 2, y: 31, label: "" }] },
    ],
  };
  const svg = renderQuestionVisualSvg(parseQuestionVisualSpec(visual, "line_graph"));
  assert.match(svg, /العينة أ/);
  assert.match(svg, /العينة ب/);
  assert.match(svg, /qv-series-1/);
});

test("يرسم جدول بيانات بخلية ناقصة وتدريج جهاز قياس", () => {
  const table = {
    ...emptyQuestionVisualSpec(),
    type: "data_table",
    variant: "table_completion",
    title: "نتائج تجربة",
    altText: "جدول قراءات مع قيمة ناقصة",
    tableColumns: ["الزمن (s)", "المسافة (m)"],
    tableRows: ["1", "2", "3"],
    tableCells: [["0", "0"], ["1", "2"], ["2", "4"]],
    hiddenCells: ["r1c1"],
  };
  const scale = {
    ...emptyQuestionVisualSpec(),
    type: "instrument_scale",
    variant: "thermometer",
    title: "قراءة ميزان حرارة",
    altText: "ميزان حرارة بقراءة محددة",
    labels: ["ميزان حرارة", "°C"],
    values: [-10, 100, 10, 40],
  };
  assert.match(renderQuestionVisualSvg(parseQuestionVisualSpec(table, "data_table")), /qv-table-missing/);
  assert.match(renderQuestionVisualSvg(parseQuestionVisualSpec(scale, "instrument_scale")), /qv-instrument-fill/);
  assert.throws(() => parseQuestionVisualSpec({ ...table, tableCells: [["0"]] }, "data_table"), /عدد خلايا|بيانات مكتملة/);
});

test("يرسم مخططات الأشعة والقوى والعمليات بصيغة SVG حتمية", () => {
  const ray = {
    ...emptyQuestionVisualSpec(),
    type: "ray_diagram",
    variant: "reflection",
    title: "انعكاس الضوء",
    altText: "شعاع ساقط ومنعكس عند مرآة",
    values: [40, 40],
  };
  const force = {
    ...emptyQuestionVisualSpec(),
    type: "force_diagram",
    variant: "free_body",
    title: "مخطط جسم حر",
    altText: "جسم تؤثر عليه أربع قوى",
    labels: ["الجسم"],
    vectors: [
      { label: "الوزن", x: 0, y: 0, dx: 0, dy: 80, magnitude: 10 },
      { label: "رد الفعل", x: 0, y: 0, dx: 0, dy: -80, magnitude: 10 },
    ],
  };
  const flow = {
    ...emptyQuestionVisualSpec(),
    type: "flow_diagram",
    variant: "linear_flow",
    title: "تسلسل عملية",
    altText: "ثلاث مراحل مترابطة بأسهم",
    labels: ["البداية", "المعالجة", "الناتج"],
    annotations: ["ثم", "ينتج"],
  };
  assert.match(renderQuestionVisualSvg(parseQuestionVisualSpec(ray, "ray_diagram")), /qv-mirror/);
  assert.match(renderQuestionVisualSvg(parseQuestionVisualSpec(force, "force_diagram")), /qv-force-arrow/);
  assert.match(renderQuestionVisualSvg(parseQuestionVisualSpec(flow, "flow_diagram")), /qv-flow-node/);
});


test("يستخدم صورة 2D مدققة للمشهد المؤهل ويبقي SVG حتميًا خلفها", () => {
  const visual = parseQuestionVisualSpec({
    ...emptyQuestionVisualSpec(),
    type: "electrostatic_diagram",
    variant: "charge_transfer",
    role: "interpret",
    visualId: "hybrid-charge-1",
    title: "شحن مسطرة بالدلك",
    altText: "مسطرة بلاستيكية تدلك بقطعة قماش قرب قصاصات ورق",
    labels: ["المسطرة البلاستيكية", "قطعة القماش"],
    values: [1],
    annotations: ["اتجاه الدلك"],
    illustration: {
      url: "https://example.supabase.co/storage/v1/object/public/wathiq-question-visuals/user/draft/item.png",
      assetPath: "user/draft/item.png",
      mimeType: "image/png",
      model: "gemini-3.1-flash-image",
      generatedAt: "2026-07-31T12:00:00.000Z",
      promptVersion: "wathiq-controlled-2d-v1",
      validated: true,
    },
  }, "electrostatic_diagram");
  assert.equal(isAiIllustrationEligible(visual), true);
  const html = renderQuestionVisualSvg(visual);
  assert.match(html, /question-visual-hybrid/);
  assert.match(html, /question-visual-illustration/);
  assert.match(html, /question-visual-deterministic-fallback/);
  assert.match(html, /qv-rod/);
  assert.match(html, /data-visual-mode="hybrid"/);
  const stripped = stripQuestionVisualIllustration(visual);
  assert.equal(stripped.illustration, undefined);
  assert.match(renderQuestionVisualSvg(stripped), /data-visual-mode="deterministic"/);
});

test("يرفض بيانات صورة غير آمنة ولا يحول مخطط القوى إلى صورة حرة", () => {
  assert.equal(parseQuestionVisualIllustration({ url: "javascript:alert(1)", validated: true }), undefined);
  const force = parseQuestionVisualSpec({
    ...emptyQuestionVisualSpec(),
    type: "force_diagram",
    variant: "free_body",
    role: "calculate",
    title: "مخطط جسم حر",
    altText: "جسم تؤثر عليه قوتان أفقيتان",
    labels: ["الصندوق"],
    vectors: [
      { label: "القوة المؤثرة", x: 0, y: 0, dx: 80, dy: 0, magnitude: 8 },
      { label: "الاحتكاك", x: 0, y: 0, dx: -60, dy: 0, magnitude: 6 },
    ],
    illustration: {
      url: "https://example.test/force.png",
      assetPath: "force.png",
      mimeType: "image/png",
      model: "gemini-test",
      generatedAt: "2026-07-31T12:00:00.000Z",
      promptVersion: "test",
      validated: true,
    },
  }, "force_diagram");
  assert.equal(isAiIllustrationEligible(force), false);
  const html = renderQuestionVisualSvg(force);
  assert.doesNotMatch(html, /question-visual-illustration/);
  assert.match(html, /القوة المؤثرة \(8 N\)/);
  assert.match(html, /الاحتكاك \(6 N\)/);
});

test("يعرض مخطط حساب الضغط القوة والمساحة ووحداتهما", () => {
  const pressure = parseQuestionVisualSpec({
    ...emptyQuestionVisualSpec(),
    type: "pressure_diagram",
    variant: "force_area",
    role: "calculate",
    title: "حساب الضغط",
    altText: "قوة تؤثر على مساحة تلامس معلومة",
    labels: ["القوة", "المساحة"],
    values: [80, 0.02],
  }, "pressure_diagram");
  const html = renderQuestionVisualSvg(pressure);
  assert.match(html, /القوة F = 80 N/);
  assert.match(html, /مساحة التلامس A = 0\.02 m²/);
});

test("يرسم مشاهد حياتية حتمية مختلفة ويجعلها مؤهلة للتحسين البصري", () => {
  const build = (variant, labels) => ({
    ...emptyQuestionVisualSpec(),
    type: "context_scene",
    visualId: `scene-${variant}`,
    variant,
    role: "interpret",
    purpose: "تطبيق المفهوم في الحياة اليومية",
    title: "موقف علمي من الحياة اليومية",
    altText: `مشهد ${variant}`,
    labels,
  });
  const door = parseQuestionVisualSpec(build("door_handle", ["الباب", "المقبض"]), "context_scene");
  const seesaw = parseQuestionVisualSpec(build("playground_seesaw", ["نقطة الارتكاز", "الأرجوحة"]), "context_scene");
  const wrench = parseQuestionVisualSpec(build("wrench_tool", ["الصامولة", "مفتاح الربط"]), "context_scene");
  const doorSvg = renderQuestionVisualSvg(door);
  const seesawSvg = renderQuestionVisualSvg(seesaw);
  const wrenchSvg = renderQuestionVisualSvg(wrench);
  assert.notEqual(doorSvg, seesawSvg);
  assert.notEqual(seesawSvg, wrenchSvg);
  assert.match(doorSvg, /المقبض/);
  assert.match(seesawSvg, /نقطة الارتكاز/);
  assert.match(wrenchSvg, /مفتاح الربط/);
  assert.equal(isAiIllustrationEligible(door), true);
  assert.equal(isAiIllustrationEligible(seesaw), true);
  assert.equal(isAiIllustrationEligible(wrench), true);
});
