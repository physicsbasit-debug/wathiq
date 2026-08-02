import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyWholeExamVisualBudget,
  ASSESSMENT_GENERATION_V2_VERSION,
} from "../dist/assets/assessment-generation-v2.js";
import {
  clearDraftResumeContext,
  loadDraftResumeContext,
  normalizeExamDraft,
  saveDraftResumeContext,
} from "../dist/assets/storage.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function withMemoryStorage(run) {
  const original = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); },
    key(index) { return [...values.keys()][index] ?? null; },
    get length() { return values.size; },
  };
  try { return run(values); } finally { globalThis.localStorage = original; }
}

function visualItem(id, visualTarget, styleTarget = "سياقي", marks = 1, cognitiveLevel = "تطبيق") {
  return {
    planItemId: id,
    questionType: "إجابة قصيرة",
    cognitiveLevel,
    marks,
    sourceReferenceId: "ref-1",
    lessonLabel: "عزم القوة",
    outcomeLabel: "يطبق مفهوم العزم في مواقف حياتية",
    styleTarget,
    visualTarget,
    scenarioTarget: "door_handle",
    stimulusTarget: visualTarget === "data_table" ? "data_table" : "real_life_scene",
    skillTarget: styleTarget === "حسابي" ? "calculate" : "apply",
    diversityKey: `${id}|${visualTarget}`,
  };
}

test("يثبت إصدار محرك سلامة الاختبار واستئناف المسودة", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const edge = fs.readFileSync(path.join(root, "supabase/functions/generate-source-questions/index.ts"), "utf8");
  assert.match(pkg.version, /^0\.0\.(?:51|52)$/);
  assert.equal(ASSESSMENT_GENERATION_V2_VERSION, "source-grounded-policy-ai-18-exam-integrity-resume");
  assert.match(edge, /source-grounded-policy-ai-18-exam-integrity-resume/);
  assert.match(edge, /source-grounded-policy-ai-17-whole-exam-v2/);
});

test("يحفظ شجرة الدروس النشطة مع المسودة ويستعيدها حسب معرف المسودة", () => withMemoryStorage(() => {
  saveDraftResumeContext({
    schemaVersion: 1,
    draftId: "draft-resume-1",
    selectionKey: "10|physics|source-1",
    activeUnitKey: "source-1::الوحدة الخامسة",
    savedAt: "2026-08-01T18:00:00.000Z",
    lessonCatalog: [{
      id: "lesson-5-2",
      sourceId: "source-1",
      sourceTitle: "كتاب الطالب",
      label: "5-2 حساب عزم القوة",
      code: "5-2",
      title: "حساب عزم القوة",
      pageStart: 88,
      pageEnd: 92,
      unitLabel: "الوحدة الخامسة: تأثير القوى",
      origin: "curated-book-tree",
    }],
  });
  const restored = loadDraftResumeContext("draft-resume-1");
  assert.equal(restored?.activeUnitKey, "source-1::الوحدة الخامسة");
  assert.equal(restored?.lessonCatalog[0]?.label, "5-2 حساب عزم القوة");
  clearDraftResumeContext("draft-resume-1");
  assert.equal(loadDraftResumeContext("draft-resume-1"), null);
}));

test("لا يعيد المسودة الجزئية إلى اختبار جديد عند تعثر التوليد", () => {
  const draft = normalizeExamDraft({
    id: "draft-partial-v2",
    grade: 10,
    subjectId: "physics",
    assessmentPolicyId: "oman-science-assessment-2025-2026",
    lessonTopics: ["5-1 مفهوم عزم القوة", "5-2 حساب عزم القوة"],
    sourceReferences: [{
      id: "ref-1", sourceId: "source-1", sourceTitle: "كتاب الطالب", sourceKind: "كتاب الطالب",
      pageFrom: 85, pageTo: 92, excerpt: "عزم القوة يساوي القوة مضروبة في البعد العمودي.",
      lessonTopic: "5-2 حساب عزم القوة", score: 95,
    }],
    sourceRetrievalVersion: "outdated-retrieval",
    generationMode: "whole_exam_v2",
    generationVersion: "source-grounded-policy-ai-17-whole-exam-v2",
    currentStep: 3,
    plan: [{
      id: "plan-1", questionType: "إجابة قصيرة", cognitiveLevel: "تطبيق", marks: 2,
      lessonId: "lesson-1", lessonLabel: "5-2 حساب عزم القوة", outcomeId: "o-1",
      outcomeLabel: "يحسب عزم القوة", proposals: [], sourceReferenceId: "ref-1",
    }],
  });
  assert.ok(draft);
  assert.equal(draft.currentStep, 3);
  assert.equal(draft.plan.length, 1);
  assert.equal(draft.lessonTopics.length, 2);
  assert.equal(draft.sourceReferences.length, 1);
});

test("يحد مرئيات الاختبار القصير إلى أربع ويحافظ على الرسوم الحسابية والبيانية الأعلى قيمة", () => {
  const items = [
    visualItem("context-1", "context_scene"),
    visualItem("force-calc", "force_diagram", "حسابي", 3),
    visualItem("table-data", "data_table", "بيانات", 2, "استدلال"),
    visualItem("context-2", "context_scene"),
    visualItem("graph-data", "line_graph", "بيانات", 2),
    visualItem("context-3", "context_scene"),
  ];
  const optimized = applyWholeExamVisualBudget(items);
  assert.equal(optimized.filter((item) => item.visualTarget !== "none").length, 4);
  assert.equal(optimized.find((item) => item.planItemId === "force-calc")?.visualTarget, "force_diagram");
  assert.equal(optimized.find((item) => item.planItemId === "table-data")?.visualTarget, "data_table");
  assert.equal(optimized.find((item) => item.planItemId === "graph-data")?.visualTarget, "line_graph");
});

test("يضمن تصدير المشاهد الحياتية دون كتل سوداء ويحفظ أبعاد العزم", () => {
  const exportSource = fs.readFileSync(path.join(root, "src/exam-export.ts"), "utf8");
  const visualSource = fs.readFileSync(path.join(root, "src/question-visual.ts"), "utf8");
  assert.match(exportSource, /\.qv-context-object[^\n]+fill: #fff/);
  assert.match(exportSource, /\.qv-context-wheel[^\n]+fill: #f8fafc/);
  assert.match(exportSource, /\.qv-dimension/);
  assert.match(visualSource, /momentDistance1/);
  assert.match(visualSource, /نقطة الارتكاز/);
});

test("يثبت بوابة سلامة الجداول ومنع تسريب بياناتها داخل السؤال", () => {
  const edge = fs.readFileSync(path.join(root, "supabase/functions/generate-source-questions/index.ts"), "utf8");
  assert.match(edge, /validateNoTableDataDump/);
  assert.match(edge, /سؤال العزم يحتاج جدولًا يتضمن القوة والمسافة عن محور الدوران/);
  assert.match(edge, /سؤال عدد الإلكترونات يحتاج بيانات شحنة الجسم وشحنة الإلكترون/);
  assert.match(edge, /نص السؤال يكرر سلسلة طويلة من قيم الجدول/);
});
