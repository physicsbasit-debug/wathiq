import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseScientificItemModel,
  scientificItemIsComplete,
  scientificItemMatchesVisual,
} from "../dist/assets/scientific-item.js";
import {
  emptyQuestionVisualSpec,
  parseQuestionVisualSpec,
  questionVisualAssetRequirement,
  renderQuestionVisualSvg,
} from "../dist/assets/question-visual.js";
import { ASSESSMENT_GENERATION_V2_VERSION } from "../dist/assets/assessment-generation-v2.js";

const text = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(await text("package.json"));
const edge = await text("supabase/functions/generate-source-questions/index.ts");
const jobsEdge = await text("supabase/functions/question-visual-jobs/index.ts");
const app = await text("src/app.ts");
const jobsClient = await text("src/visual-jobs.ts");

function forceModel() {
  return parseScientificItemModel({
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
      { kind: "applied_force", label: "القوة المؤثرة", value: 55, unit: "N", direction: "right" },
      { kind: "friction_force", label: "الاحتكاك", value: 30, unit: "N", direction: "left" },
      { kind: "weight", label: "الوزن", value: 120, unit: "N", direction: "down" },
      { kind: "normal_force", label: "رد الفعل", value: 120, unit: "N", direction: "up" },
    ],
    resultValue: 25,
    resultUnit: "N",
    resultDirection: "right",
    expectedResult: "القوة المحصلة 25 N إلى اليمين",
  });
}

function forceVisual(applied = 55) {
  return parseQuestionVisualSpec({
    ...emptyQuestionVisualSpec(),
    type: "force_diagram",
    variant: "free_body",
    role: "calculate",
    title: "مخطط القوى المؤثرة على عربة تسوق",
    altText: "عربة تسوق تؤثر فيها أربع قوى",
    labels: ["عربة تسوق"],
    vectors: [
      { label: "القوة المؤثرة", x: 55, y: 0, dx: 90, dy: 0, magnitude: applied },
      { label: "الاحتكاك", x: -55, y: 0, dx: -70, dy: 0, magnitude: 30 },
      { label: "الوزن", x: 0, y: 10, dx: 0, dy: 90, magnitude: 120 },
      { label: "رد الفعل", x: 0, y: -10, dx: 0, dy: -90, magnitude: 120 },
    ],
  }, "force_diagram");
}

function repulsionModel() {
  return parseScientificItemModel({
    version: "scientific-item-v1",
    kind: "electrostatic_system",
    phenomenon: "تفاعل الشحنات المتشابهة",
    primaryEntity: "الجسم س",
    secondaryEntity: "الجسم ص",
    visualObject: "جسمان مشحونان",
    relationship: "repulsion",
    primaryCharge: "positive",
    secondaryCharge: "positive",
    transferredParticle: "",
    quantities: [],
    resultValue: 0,
    resultUnit: "",
    resultDirection: "away",
    expectedResult: "الشحنتان موجبتان ولذلك تتنافران",
  });
}

function electrostaticVisual(attractionFlag = 0, withIllustration = false) {
  return parseQuestionVisualSpec({
    ...emptyQuestionVisualSpec(),
    type: "electrostatic_diagram",
    variant: "attraction_repulsion",
    role: "compare",
    title: "تفاعل جسمين مشحونين",
    altText: "جسمان موجبان يتنافران",
    labels: ["الجسم س", "الجسم ص"],
    values: [attractionFlag],
    annotations: [attractionFlag ? "تجاذب" : "تنافر", "positive", "positive"],
    ...(withIllustration ? {
      illustration: {
        url: "https://example.supabase.co/storage/v1/object/public/wathiq-question-visuals/item.png",
        assetPath: "owner/draft/plan/item.png",
        mimeType: "image/png",
        model: "gemini-3.1-flash-image",
        generatedAt: "2026-08-03T00:00:00.000Z",
        promptVersion: "wathiq-unified-scientific-item-v4",
        validated: true,
        assetKind: "scene_2d_overlay",
        renderMode: "overlay",
      },
    } : {}),
  }, "electrostatic_diagram");
}

test("يثبت Phase 2-C4 Fix 2 وعقد ai-21 للنموذج العلمي المملوك للخادم", () => {
  assert.equal(pkg.version, "0.0.59");
  assert.equal(ASSESSMENT_GENERATION_V2_VERSION, "source-grounded-policy-ai-21-server-owned-scientific-item");
  assert.match(pkg.description, /نموذج علمي موحد/);
});

test("يتحقق من القوة المحصلة ويرفض نموذجًا عدديًا داخليًا غير متسق", () => {
  const model = forceModel();
  assert.equal(scientificItemIsComplete(model), true);
  const wrong = { ...model, resultValue: 24 };
  assert.equal(scientificItemIsComplete(wrong), false);
});

test("يربط أرقام واتجاهات مخطط القوى بالنموذج نفسه ولا يقبل قيمة قديمة", () => {
  const model = forceModel();
  assert.equal(scientificItemMatchesVisual(model, forceVisual()), true);
  assert.equal(scientificItemMatchesVisual(model, forceVisual(8)), false);
});

test("يرفض علميًا سهم تجاذب لشحنتين موجبتين ويقبل التنافر", () => {
  const model = repulsionModel();
  assert.equal(scientificItemIsComplete(model), true);
  assert.equal(scientificItemMatchesVisual(model, electrostaticVisual(0)), true);
  assert.equal(scientificItemMatchesVisual(model, electrostaticVisual(1)), false);
});

test("يعرض صورة أساس للشحنات مع طبقة رموز وأسهم فقط دون دوائر SVG مكررة", () => {
  const visual = electrostaticVisual(0, true);
  assert.deepEqual(questionVisualAssetRequirement(visual), {
    required: true,
    mode: "overlay",
    reason: "يتطلب أصلًا بصريًا 2D مع طبقة رموز وأسهم وقيم علمية يملكها واثق.",
  });
  const html = renderQuestionVisualSvg(visual);
  assert.match(html, /data-visual-mode="illustrated-overlay"/);
  const overlay = html.match(/<div class="question-visual-overlay">([\s\S]*?)<\/div>/)?.[1] ?? "";
  assert.match(overlay, /تنافر/);
  assert.match(overlay, />\+</);
  assert.doesNotMatch(overlay, /<circle/);
  assert.doesNotMatch(overlay, /qv-charged-object/);
});

test("يجعل الخادم النموذج العلمي مصدر الحقيقة للسؤال والمرئي والإجابة", () => {
  assert.match(edge, /buildServerOwnedScientificItem/);
  assert.match(edge, /serverScientificItem/);
  assert.match(edge, /المصدر العلمي الوحيد|غير القابل للاستبدال/);
  assert.match(edge, /validateScientificItemConsistency/);
  assert.match(edge, /hydrateVisualFromScientificItem/);
  assert.match(edge, /القوة .* في الرسم لا تظهر بالقيمة نفسها في متن السؤال/);
  assert.match(edge, /نوع الشحنات وعلاقة التجاذب أو التنافر غير متسقين علميًا/);
});

test("يمرر النموذج العلمي إلى مهمة الصورة ويضمّه في بصمة الأصل", () => {
  assert.match(jobsClient, /scientificItem: proposal\.scientificItem/);
  assert.match(jobsClient, /scientificItemMatchesVisual/);
  assert.match(jobsEdge, /scientificItem: Record<string, unknown>/);
  assert.match(jobsEdge, /scientificItem: input\.scientificItem/);
  assert.match(jobsEdge, /scientificItem/);
});

test("يمنع الاعتماد والتصدير عند اختلاف النموذج العلمي عن المرئي", () => {
  assert.match(app, /scientificItemMatchesVisual/);
  assert.match(app, /النموذج العلمي الموحد لكل مفردة/);
  assert.match(app, /لا تطابق نموذجها العلمي الموحد أو مرئيها المشتق منه/);
});


test("يفصل مخطط النقل الخفيف عن قواعد المجال الدقيقة", () => {
  assert.match(edge, /غلاف نقل خفيف فقط/);
  assert.doesNotMatch(edge, /prefixItems:\s*requestedItems\.map/);
  assert.doesNotMatch(edge, /minItems:\s*kind === "force_system"/);
  assert.match(edge, /buildServerOwnedScientificItem/);
  assert.match(edge, /validateScientificItemConsistency/);
  assert.match(edge, /validateGeneratedItemsIndividually/);
});
