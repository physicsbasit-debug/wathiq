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
