import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const text = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(await text("package.json"));
const client = await text("src/question-generation.ts");
const types = await text("src/types.ts");
const visual = await text("src/question-visual.ts");
const edge = await text("supabase/functions/generate-source-questions/index.ts");

 test("يثبت Phase 1-D2 وإصدار جودة القياس وتنوع السياقات", () => {
  assert.match(pkg.version, /^0\.0\.(?:48|49)$/);
  assert.match(client, /source-grounded-policy-ai-16-assessment-quality-context-diversity/);
  assert.match(pkg.description, /السياقات الحياتية/);
  assert.match(pkg.description, /كامبريدج/);
});

test("يرسل هدف التعلم والمهارة والسياق والمثير لكل مفردة", () => {
  assert.match(client, /outcomeLabel: item\.outcomeLabel/);
  assert.match(client, /scenarioTarget/);
  assert.match(client, /stimulusTarget/);
  assert.match(client, /skillTarget/);
  assert.match(client, /diversityKey/);
  assert.match(edge, /learningOutcome: item\.outcomeLabel/);
});

test("يدعم مشاهد حياتية مختلفة بدل إعادة الرسم نفسه", () => {
  assert.match(types, /"context_scene"/);
  for (const variant of ["door_handle", "playground_seesaw", "wrench_tool", "bicycle_brake", "shopping_trolley", "school_bag", "water_tank", "solar_panel", "laboratory_setup", "road_safety"]) {
    assert.match(types, new RegExp(`"${variant}"`));
    if (variant !== "laboratory_setup") {
      assert.match(visual, new RegExp(`variant === "${variant}"|${variant}:`));
    }
    assert.match(edge, new RegExp(`${variant}:`));
  }
});

test("يرفض الخادم خطة اختبار فقيرة التنوع أو مفرطة في الاستدعاء", () => {
  assert.match(edge, /validateOfficialAssessmentDiversity/);
  assert.match(edge, /styleCount < 4/);
  assert.match(edge, /skillCount < 3/);
  assert.match(edge, /directRecognitionLimit/);
  assert.match(edge, /تنوعًا كافيًا في مواقف الحياة اليومية/);
});

test("يلزم مولد الأسئلة بسياقات حقيقية وبدائل غير متشابهة", () => {
  assert.match(edge, /لا تكرر الأسرة السياقية نفسها/);
  assert.match(edge, /لا تجعل أكثر من مفردة واحدة تعريفًا أو سؤال وحدة مباشرًا/);
  assert.match(edge, /validateAssessmentQuality/);
  assert.match(edge, /validateAlternativeDiversity/);
  assert.match(edge, /البدائل الثلاثة متشابهة أكثر من اللازم/);
});
