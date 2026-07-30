import test from "node:test";
import assert from "node:assert/strict";
import { normalizeExamDraft } from "../dist/assets/storage.js";

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
  assert.deepEqual(draft.sourceReferences, []);
  assert.deepEqual(draft.plan, []);
});


test("يعيد مسودة Phase 1-A ذات الصياغات التجريبية إلى الإعداد قبل التوليد الحقيقي", () => {
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
  assert.equal(draft.currentStep, 2);
  assert.deepEqual(draft.plan, []);
  assert.deepEqual(draft.selectedProposalByPlanItem, {});
  assert.equal(draft.generationVersion, "");
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
  assert.deepEqual(draft.plan, []);
});
