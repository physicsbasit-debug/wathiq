import test from "node:test";
import assert from "node:assert/strict";
import { clearDraft, loadDraft, loadDrafts, normalizeExamDraft, saveDraft, setActiveDraftId } from "../dist/assets/storage.js";
import { SOURCE_RETRIEVAL_VERSION } from "../dist/assets/source-retrieval.js";

function twoLessonReferences() {
  return [
    {
      id: "source-1:0:lesson-1",
      sourceId: "source-1",
      sourceTitle: "كتاب الطالب",
      sourceKind: "كتاب الطالب",
      pageFrom: 17,
      pageTo: 17,
      excerpt: "الشحنة الكهربائية خاصية فيزيائية.",
      lessonTopic: "1-1 الشحنة الكهربائية",
      score: 80,
    },
    {
      id: "source-1:1:lesson-2",
      sourceId: "source-1",
      sourceTitle: "كتاب الطالب",
      sourceKind: "كتاب الطالب",
      pageFrom: 18,
      pageTo: 18,
      excerpt: "تتجاذب الشحنات المختلفة.",
      lessonTopic: "1-2 التأثيرات الكهربائية",
      score: 79,
    },
  ];
}

test("يعيد المسودة القديمة إلى خطوة المحتوى بدل تركها في مسار الوحدات التجريبي", () => {
  const draft = normalizeExamDraft({
    id: "old",
    grade: 10,
    subjectId: "physics",
    unitId: "physics-u1",
    lessonIds: ["physics-u1-l1"],
    outcomeIds: ["p1-o1"],
    currentStep: 3,
    plan: [{ id: "legacy" }],
    selectedProposalByPlanItem: { legacy: "p1" },
  });
  assert.ok(draft);
  assert.equal(draft.currentStep, 1);
  assert.equal(draft.topic, "");
  assert.deepEqual(draft.lessonTopics, ["", ""]);
  assert.deepEqual(draft.sourceReferences, []);
  assert.deepEqual(draft.plan, []);
});

test("يرحّل مسودة الموضوع الواحد إلى صفين للدروس ويعيدها إلى خطوة المحتوى", () => {
  const draft = normalizeExamDraft({
    id: "phase-1-a",
    grade: 10,
    subjectId: "physics",
    topic: "الشحنة الكهربائية",
    sourceReferences: [{
      id: "source-1:0",
      sourceId: "source-1",
      sourceTitle: "كتاب الطالب",
      sourceKind: "كتاب الطالب",
      pageFrom: 17,
      pageTo: 17,
      excerpt: "الشحنة الكهربائية خاصية فيزيائية.",
      score: 80,
    }],
    currentStep: 3,
    plan: [{ id: "legacy-plan", proposals: [{ id: "legacy-proposal" }] }],
    selectedProposalByPlanItem: { "legacy-plan": "legacy-proposal" },
  });
  assert.ok(draft);
  assert.equal(draft.currentStep, 1);
  assert.deepEqual(draft.lessonTopics, ["الشحنة الكهربائية", ""]);
  assert.deepEqual(draft.plan, []);
  assert.deepEqual(draft.selectedProposalByPlanItem, {});
  assert.equal(draft.generationVersion, "");
});

test("يحافظ على مسودة حديثة مرتبطة بدرسين ويعيدها إلى الإعداد دون حذف المرجع", () => {
  const draft = normalizeExamDraft({
    id: "multi-lessons-old-generation",
    grade: 10,
    subjectId: "physics",
    lessonTopics: ["1-1 الشحنة الكهربائية", "1-2 التأثيرات الكهربائية"],
    sourceReferences: twoLessonReferences(),
    currentStep: 3,
    generationVersion: "source-grounded-policy-ai-2",
    plan: [{ id: "legacy-plan" }],
  });
  assert.ok(draft);
  assert.equal(draft.currentStep, 3);
  assert.equal(draft.topic, "1-1 الشحنة الكهربائية، 1-2 التأثيرات الكهربائية");
  assert.equal(draft.sourceReferences.length, 2);
  assert.deepEqual(draft.plan, []);
});

test("يحافظ على مرحلة الخطة لمسودة منشأة بالإصدار الدفعي الحالي", () => {
  const draft = normalizeExamDraft({
    id: "multi-lessons-current",
    grade: 10,
    subjectId: "physics",
    assessmentPolicyId: "oman-science-assessment-2025-2026",
    lessonTopics: ["1-1 الشحنة الكهربائية", "1-2 التأثيرات الكهربائية"],
    sourceReferences: twoLessonReferences(),
    sourceRetrievalVersion: SOURCE_RETRIEVAL_VERSION,
    currentStep: 3,
    generationVersion: "source-grounded-policy-ai-13-trusted-enrichment",
    plan: [{ id: "plan-1", proposals: [] }],
  });
  assert.ok(draft);
  assert.equal(draft.currentStep, 3);
  assert.equal(draft.sourceReferences[0].lessonTopic, "1-1 الشحنة الكهربائية");
});

test("يرقي مسودة C3 المكتملة إلى عقد C4 دون حذف الأسئلة", () => {
  const draft = normalizeExamDraft({
    id: "c3-compatible",
    grade: 10,
    subjectId: "physics",
    assessmentPolicyId: "oman-science-assessment-2025-2026",
    lessonTopics: ["1-1 الشحنة الكهربائية", "1-2 التأثيرات الكهربائية"],
    sourceReferences: twoLessonReferences(),
    sourceRetrievalVersion: SOURCE_RETRIEVAL_VERSION,
    currentStep: 3,
    generationVersion: "source-grounded-policy-ai-12-advanced-visuals",
    plan: [{
      id: "plan-c3",
      lessonId: "lesson-c3",
      lessonLabel: "الشحنة الكهربائية",
      outcomeId: "outcome-c3",
      outcomeLabel: "يفسر أثر الشحنة الكهربائية",
      cognitiveLevel: "application",
      questionType: "short",
      marks: 2,
      proposals: [{
        id: "proposal-c3",
        text: "فسر انجذاب قصاصات الورق إلى مسطرة مشحونة.",
        answer: "تنجذب القصاصات بسبب الاستقطاب الكهربائي.",
      }],
    }],
  });
  assert.ok(draft);
  assert.equal(draft.currentStep, 3);
  assert.equal(draft.generationVersion, "source-grounded-policy-ai-16-assessment-quality-context-diversity");
  assert.equal(draft.plan.length, 1);
  assert.equal(draft.plan[0].proposals.length, 1);
});

test("يرحّل المسودة القديمة إلى قالب التقويم الرسمي للصف العاشر", () => {
  const draft = normalizeExamDraft({
    id: "legacy-policy",
    grade: 10,
    subjectId: "physics",
    topic: "الشحنة الكهربائية",
    title: "اختبار قصير",
    examDate: "2026-09-15",
    totalMarks: 20,
    counts: { mcq: 8, short: 4, long: 1 },
    sourceReferences: [{
      id: "source-1:0",
      sourceId: "source-1",
      sourceTitle: "كتاب الطالب",
      sourceKind: "كتاب الطالب",
      pageFrom: 17,
      pageTo: 17,
      excerpt: "الشحنة الكهربائية خاصية فيزيائية.",
      score: 80,
    }],
    currentStep: 2,
  });
  assert.ok(draft);
  assert.equal(draft.assessmentPolicyId, "oman-science-assessment-2025-2026");
  assert.equal(draft.totalMarks, 10);
  assert.deepEqual(draft.counts, { mcq: 2, short: 3, long: 1 });
  assert.equal(draft.currentStep, 1);
  assert.deepEqual(draft.plan, []);
});


test("يفعل الرسوم الهجينة افتراضيًا ويحافظ على تعطيلها الصريح", () => {
  const base = {
    id: "hybrid-default",
    grade: 10,
    subjectId: "physics",
    assessmentPolicyId: "oman-science-assessment-2025-2026",
    lessonTopics: ["1-1 الشحنة الكهربائية", "1-2 التأثيرات الكهربائية"],
    sourceReferences: twoLessonReferences(),
    sourceRetrievalVersion: SOURCE_RETRIEVAL_VERSION,
    currentStep: 2,
  };
  assert.equal(normalizeExamDraft(base)?.visualEnhancementEnabled, true);
  assert.equal(normalizeExamDraft({ ...base, visualEnhancementEnabled: false })?.visualEnhancementEnabled, false);
});

function withMemoryStorage(run) {
  const original = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); },
  };
  try {
    return run(values);
  } finally {
    globalThis.localStorage = original;
  }
}

test("يحفظ أكثر من مسودة دون أن يستبدل الاختبار الجديد العمل السابق", () => {
  withMemoryStorage(() => {
    const first = normalizeExamDraft({ id: "draft-a", updatedAt: "2026-08-01T10:00:00.000Z", title: "الاختبار القصير الأول" });
    const second = normalizeExamDraft({ id: "draft-b", updatedAt: "2026-08-01T11:00:00.000Z", title: "الاختبار القصير الثاني" });
    assert.ok(first && second);
    saveDraft(first);
    saveDraft(second);
    assert.deepEqual(loadDrafts().map((draft) => draft.id), ["draft-b", "draft-a"]);
    assert.equal(loadDraft()?.id, "draft-b");
    assert.equal(loadDraft("draft-a")?.id, "draft-a");
  });
});

test("يحذف مسودة محددة ويبقي بقية المسودات قابلة للاستئناف", () => {
  withMemoryStorage(() => {
    const first = normalizeExamDraft({ id: "draft-a", updatedAt: "2026-08-01T10:00:00.000Z" });
    const second = normalizeExamDraft({ id: "draft-b", updatedAt: "2026-08-01T11:00:00.000Z" });
    assert.ok(first && second);
    saveDraft(first);
    saveDraft(second);
    setActiveDraftId("draft-a");
    assert.equal(loadDraft()?.id, "draft-a");
    clearDraft("draft-a");
    assert.deepEqual(loadDrafts().map((draft) => draft.id), ["draft-b"]);
    assert.equal(loadDraft()?.id, "draft-b");
  });
});

test("يرحّل المسودة المحلية القديمة إلى مخزن المسودات المتعددة", () => {
  withMemoryStorage((values) => {
    values.set("wathiq.phase0b.latestDraft", JSON.stringify({ id: "legacy-draft", updatedAt: "2026-08-01T09:00:00.000Z" }));
    assert.equal(loadDraft()?.id, "legacy-draft");
    assert.equal(loadDrafts().length, 1);
    assert.ok(values.has("wathiq.examDrafts.v1"));
  });
});
