import { assertWathiqPatchAtLeast } from "./version-assertions.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  applyWholeExamVisualBudget,
  ASSESSMENT_GENERATION_V2_VERSION,
  ensureScientificallyEssentialVisual,
  isScientificallyEssentialVisual,
} from "../dist/assets/assessment-generation-v2.js";

const text = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(await text("package.json"));
const edge = await text("supabase/functions/generate-source-questions/index.ts");

function item(id, overrides = {}) {
  return {
    planItemId: id,
    questionType: "إجابة قصيرة",
    cognitiveLevel: "تطبيق",
    marks: 1,
    sourceReferenceId: "ref-1",
    lessonLabel: "القوى والحركة",
    outcomeLabel: "يطبق مفهوم القوة في موقف جديد",
    styleTarget: "سياقي",
    visualTarget: "context_scene",
    scenarioTarget: "laboratory_setup",
    stimulusTarget: "real_life_scene",
    skillTarget: "apply",
    diversityKey: `${id}|context_scene`,
    ...overrides,
  };
}

function momentItem(id, overrides = {}) {
  return item(id, {
    lessonLabel: "عزم القوة",
    outcomeLabel: "يفسر أثر موضع القوة في دوران جسم حول محور",
    scenarioTarget: "door_handle",
    ...overrides,
  });
}

test("يثبت Fix 7 عقد المرئي العلمي الضروري", () => {
  assertWathiqPatchAtLeast(pkg.version, 63);
  assert.equal(ASSESSMENT_GENERATION_V2_VERSION, "source-grounded-policy-ai-25-essential-scientific-visual-contract");
  assert.match(edge, /enforceServerOwnedScientificVisualContract/);
  assert.match(edge, /generationItemRequiresEssentialMomentVisual/);
});

test("ترقي الواجهة سؤال العزم السياقي القديم من none إلى context_scene", () => {
  const original = momentItem("moment-none", { visualTarget: "none" });
  assert.equal(isScientificallyEssentialVisual(original), true);
  const protectedItem = ensureScientificallyEssentialVisual(original);
  assert.equal(protectedItem.visualTarget, "context_scene");
  assert.equal(protectedItem.stimulusTarget, "real_life_scene");
  assert.match(protectedItem.diversityKey, /context_scene/);
});



test("تكتشف الواجهة ضرورة مرئي العزم من نص المرجع حتى لو كان عنوان الهدف عامًا", () => {
  const original = item("moment-from-reference", {
    lessonLabel: "تطبيقات القوى",
    outcomeLabel: "يفسر أثر مكان دفع الباب في سهولة فتحه",
    scenarioTarget: "door_handle",
    visualTarget: "none",
  });
  const references = [{
    id: "ref-1",
    sourceId: "physics-book",
    sourceTitle: "كتاب الطالب",
    sourceKind: "كتاب الطالب",
    pageFrom: 58,
    pageTo: 60,
    excerpt: "يعتمد عزم القوة على القوة والبعد العمودي عن محور الدوران.",
    lessonTopic: "تطبيقات القوى",
    score: 98,
  }];
  const [protectedItem] = applyWholeExamVisualBudget([original], references);
  assert.equal(protectedItem.visualTarget, "context_scene");
});

test("ترقي مسألة العزم الحسابية القديمة إلى force_diagram", () => {
  const protectedItem = ensureScientificallyEssentialVisual(momentItem("moment-calc", {
    styleTarget: "حسابي",
    skillTarget: "calculate",
    marks: 3,
    visualTarget: "none",
  }));
  assert.equal(protectedItem.visualTarget, "force_diagram");
  assert.equal(protectedItem.stimulusTarget, "scientific_diagram");
});

test("لا تسمح ميزانية الرسوم بإسقاط مرئي العزم الضروري لصالح رسوم تجميلية أعلى ترتيبًا", () => {
  const items = [
    item("graph-1", { visualTarget: "line_graph", styleTarget: "بيانات", marks: 2 }),
    item("table-1", { visualTarget: "data_table", styleTarget: "بيانات", marks: 2 }),
    item("force-1", { visualTarget: "force_diagram", styleTarget: "حسابي", marks: 3 }),
    item("graph-2", { visualTarget: "bar_chart", styleTarget: "بيانات", marks: 2 }),
    item("scene-ordinary"),
    momentItem("moment-essential", { visualTarget: "context_scene", marks: 1 }),
  ];
  const optimized = applyWholeExamVisualBudget(items);
  assert.equal(optimized.find((candidate) => candidate.planItemId === "moment-essential")?.visualTarget, "context_scene");
  assert.equal(optimized.filter((candidate) => candidate.visualTarget !== "none").length, 4);
});

test("إذا تجاوزت المرئيات الضرورية سقف التنسيق تبقى كلها ولا يضحى بالمعلومة العلمية", () => {
  const items = [
    momentItem("m1"),
    momentItem("m2", { scenarioTarget: "playground_seesaw" }),
    momentItem("m3", { scenarioTarget: "wrench_tool" }),
    momentItem("m4", { scenarioTarget: "bicycle_brake" }),
    momentItem("m5", { scenarioTarget: "shopping_trolley" }),
    item("ordinary"),
  ];
  const optimized = applyWholeExamVisualBudget(items);
  assert.equal(optimized.filter((candidate) => candidate.visualTarget !== "none").length, 5);
  assert.ok(optimized.filter((candidate) => candidate.planItemId.startsWith("m")).every((candidate) => candidate.visualTarget !== "none"));
});
