import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  emptyQuestionVisualSpec,
  isAiIllustrationEligible,
  parseQuestionVisualSpec,
  renderQuestionVisualSvg,
} from "../dist/assets/question-visual.js";

const text = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(await text("package.json"));
const app = await text("src/app.ts");
const visualSource = await text("src/question-visual.ts");
const edge = await text("supabase/functions/generate-source-questions/index.ts");
const styles = await text("src/styles.css");
const exporter = await text("src/exam-export.ts");

function illustration() {
  return {
    url: "https://example.supabase.co/storage/v1/object/public/wathiq-question-visuals/user/draft/item.png",
    assetPath: "user/draft/item.png",
    mimeType: "image/png",
    model: "gemini-3.1-flash-image",
    generatedAt: "2026-08-02T05:00:00.000Z",
    promptVersion: "wathiq-visual-first-2d-v3-scientific-quality",
    validated: true,
  };
}

test("يثبت Phase 2-C2 وإصدار المرئيات التعليمية True 2D", () => {
  assert.match(pkg.version, /^0\.0\.(?:54|55|56|57|58|59|60|61|62|63)$/);
  assert.match(pkg.description, /True 2D|طبقة الشرح العلمي|ثنائية الأبعاد/);
});

test("يؤهل تفاعل الشحنات الآمن لصورة 2D مدققة", () => {
  const visual = parseQuestionVisualSpec({
    ...emptyQuestionVisualSpec(),
    type: "electrostatic_diagram",
    variant: "attraction_repulsion",
    role: "interpret",
    visualId: "charge-pair",
    title: "تفاعل جسمين مشحونين",
    altText: "جسمان مشحونان معلقان يوضحان التجاذب",
    labels: ["الجسم س", "الجسم ص"],
    values: [1],
    illustration: illustration(),
  }, "electrostatic_diagram");
  assert.equal(isAiIllustrationEligible(visual), true);
  const html = renderQuestionVisualSvg(visual);
  assert.match(html, /question-visual-illustration/);
  assert.match(html, /data-visual-mode="illustrated"/);
});

test("يحافظ على مخططات القوى دقيقة لكنه يرسم الجسم كعنصر 2D لا مستطيل مجرد", () => {
  const bag = parseQuestionVisualSpec({
    ...emptyQuestionVisualSpec(),
    type: "force_diagram",
    variant: "free_body",
    role: "calculate",
    visualId: "bag-force",
    title: "القوى المؤثرة في حقيبة مدرسية",
    altText: "حقيبة مدرسية تؤثر فيها قوة سحب واحتكاك",
    labels: ["الحقيبة المدرسية"],
    vectors: [
      { label: "قوة السحب", x: 0, y: 0, dx: 80, dy: 0, magnitude: 8 },
      { label: "الاحتكاك", x: 0, y: 0, dx: -60, dy: 0, magnitude: 6 },
    ],
  }, "force_diagram");
  const html = renderQuestionVisualSvg(bag);
  assert.match(html, /qv-force-bag/);
  assert.match(html, /qv-force-pocket/);
  assert.match(html, /qv-force-arrow/);
  assert.match(html, /data-visual-mode="2d-vector"/);
});

test("ينشئ مهام صور دائمة بلا حد أربع مرئيات ويستأنفها عند فتح المسودة", () => {
  assert.match(app, /requiredVisualJobItems/);
  assert.match(app, /visualJobService\.enqueue/);
  assert.match(app, /visualJobService\.list/);
  assert.match(app, /loaded\.currentStep >= 3[\s\S]*syncVisualJobs/);
  assert.doesNotMatch(app, /MAX_AUTO_VISUAL_ENHANCEMENTS/);
  assert.doesNotMatch(app, /enhanceEligibleVisuals/);
});

test("يعيد توليد الصورة مرة ثانية بملاحظات المدقق ويشدد جودة الطباعة", () => {
  assert.match(edge, /wathiq-unified-scientific-item-v4/);
  assert.match(edge, /for \(let attempt = 1; attempt <= 2; attempt \+= 1\)/);
  assert.match(edge, /Correction required after scientific review/);
  assert.match(edge, /objectCountCorrect/);
  assert.match(edge, /clear2DComposition/);
  assert.match(edge, /printReady/);
  assert.match(edge, /attraction_repulsion/);
  assert.match(edge, /scientificItem/);
  assert.match(edge, /Keep both strings nearly vertical/);
});

test("يحافظ العرض والتصدير على ألوان 2D المصقولة", () => {
  for (const source of [styles, exporter]) {
    assert.match(source, /qv-force-body/);
    assert.match(source, /qv-charge-object-two/);
    assert.match(source, /qv-rod-highlight/);
    assert.match(source, /#7dd3fc/);
  }
  assert.match(visualSource, /forceDiagramObjectKind/);
  assert.match(visualSource, /qv-force-trolley/);
});


test("يفرض الأصل الموحد بين replace وoverlay في كود العرض والخدمة", () => {
  assert.match(visualSource, /illustrationRenderMode/);
  assert.match(visualSource, /question-visual-composite/);
  assert.match(visualSource, /scene_2d_overlay/);
  assert.match(edge, /force_diagram/);
  assert.match(edge, /request\.visual\.type === "force_diagram"[\s\S]*attraction_repulsion[\s\S]*"overlay"/);
  assert.match(edge, /The application will add all scientifically controlled arrows/);
});
