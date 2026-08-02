import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadDraft,
  loadDraftResumeContext,
  normalizeExamDraft,
  saveDraft,
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

function generatedPlan() {
  return [{
    id: "plan-1",
    lessonId: "lesson-1",
    lessonLabel: "5-2 حساب عزم القوة",
    outcomeId: "outcome-1",
    outcomeLabel: "يحسب عزم القوة",
    cognitiveLevel: "تطبيق",
    questionType: "إجابة قصيرة",
    marks: 2,
    sourceReferenceId: "ref-1",
    proposals: [{
      id: "proposal-1",
      text: "احسب عزم قوة مقدارها 20 N تؤثر على بعد عمودي 0.4 m.",
      answer: "8 N m",
      markScheme: ["اختيار العلاقة الصحيحة", "التعويض مع الوحدة"],
    }],
  }];
}

test("يرقي مسودة مولدة قديمة دون مسح الخطة أو إعادتها إلى المحتوى", () => {
  const draft = normalizeExamDraft({
    id: "draft-policy-migration-with-work",
    grade: 10,
    subjectId: "physics",
    title: "الاختبار القصير الأول",
    lessonTopics: ["5-2 حساب عزم القوة"],
    sourceReferences: [],
    currentStep: 1,
    generatedAt: "2026-08-01T18:00:00.000Z",
    plan: generatedPlan(),
    selectedProposalByPlanItem: { "plan-1": "proposal-1" },
  });
  assert.ok(draft);
  assert.equal(draft.assessmentPolicyId, "oman-science-assessment-2025-2026");
  assert.equal(draft.plan.length, 1);
  assert.equal(draft.plan[0].proposals[0].text.includes("احسب عزم"), true);
  assert.equal(draft.currentStep, 3);
});

test("يحفظ لقطة شجرة الدروس داخل المسودة نفسها ويعيد تطبيعها", () => {
  const draft = normalizeExamDraft({
    id: "draft-embedded-tree",
    assessmentPolicyId: "oman-science-assessment-2025-2026",
    grade: 10,
    subjectId: "physics",
    resumeContext: {
      schemaVersion: 1,
      selectionKey: "10|physics|source-1",
      activeUnitKey: "source-1::الوحدة الخامسة",
      savedAt: "2026-08-01T18:10:00.000Z",
      lessonCatalog: [{
        id: "lesson-5-2",
        sourceId: "source-1",
        sourceTitle: "كتاب الطالب",
        label: "5-2 حساب عزم القوة",
        code: "5-2",
        title: "حساب عزم القوة",
        unitLabel: "الوحدة الخامسة",
        origin: "curated-book-tree",
      }],
    },
  });
  assert.ok(draft?.resumeContext);
  assert.equal(draft.resumeContext.activeUnitKey, "source-1::الوحدة الخامسة");
  assert.equal(draft.resumeContext.lessonCatalog[0].label, "5-2 حساب عزم القوة");
});

test("لا تستبدل لقطة شجرة صحيحة بلقطة فارغة أثناء الحفظ المتأخر", () => withMemoryStorage(() => {
  saveDraftResumeContext({
    schemaVersion: 1,
    draftId: "draft-tree-preserve",
    selectionKey: "10|physics|source-1",
    activeUnitKey: "source-1::الوحدة الخامسة",
    savedAt: "2026-08-01T18:00:00.000Z",
    lessonCatalog: [{
      id: "lesson-5-2", sourceId: "source-1", sourceTitle: "كتاب الطالب",
      label: "5-2 حساب عزم القوة", code: "5-2", title: "حساب عزم القوة",
      unitLabel: "الوحدة الخامسة", origin: "curated-book-tree",
    }],
  });
  saveDraftResumeContext({
    schemaVersion: 1,
    draftId: "draft-tree-preserve",
    selectionKey: "",
    activeUnitKey: "",
    savedAt: "2026-08-01T18:05:00.000Z",
    lessonCatalog: [],
  });
  const restored = loadDraftResumeContext("draft-tree-preserve");
  assert.equal(restored?.lessonCatalog.length, 1);
  assert.equal(restored?.activeUnitKey, "source-1::الوحدة الخامسة");
}));

test("طلب معرف مسودة غير موجود لا يفتح مسودة أخرى بالخطأ", () => withMemoryStorage(() => {
  const draft = normalizeExamDraft({ id: "draft-existing", updatedAt: "2026-08-01T18:00:00.000Z" });
  assert.ok(draft);
  saveDraft(draft);
  assert.equal(loadDraft("draft-missing"), null);
  assert.equal(loadDraft()?.id, "draft-existing");
}));

test("واجهة متابعة المسودة لا تنتقل إلى اختبار جديد عند فقد المعرف", () => {
  const app = fs.readFileSync(path.join(root, "src/app.ts"), "utf8");
  assert.match(app, /لم يتم فتح اختبار جديد بدلًا منها/);
  assert.match(app, /state\.draft\.resumeContext = resumeContext/);
  assert.match(app, /متابعة المسودة المحفوظة/);
});

test("يشدد سؤال العزم الحياتي ويضغط المرئيات السياقية في التصدير", () => {
  const edge = fs.readFileSync(path.join(root, "supabase/functions/generate-source-questions/index.ts"), "utf8");
  const exportSource = fs.readFileSync(path.join(root, "src/exam-export.ts"), "utf8");
  assert.match(edge, /سؤال العزم في الموقف الحياتي لا يحدد محور الدوران/);
  assert.match(exportSource, /question-visual-context_scene[^\n]+max-height: 52mm/);
});
