import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlan,
  computeMarks,
  createEmptyDraft,
  getAcademicContext,
  isPlanComplete,
  suggestCountsForMarks,
  validateExamSetup,
} from "../dist/assets/domain.js";

function completeDraft() {
  const draft = createEmptyDraft(new Date("2026-09-01T08:00:00Z"));
  draft.grade = 10;
  draft.subjectId = "physics";
  draft.unitId = "physics-u1";
  draft.lessonIds = ["physics-u1-l1"];
  draft.outcomeIds = ["p1-o1", "p1-o2", "p1-o3"];
  draft.title = "اختبار تجريبي";
  draft.examDate = "2026-09-15";
  return draft;
}

test("يحسب درجات أنواع الأسئلة كما هو موضح في النموذج", () => {
  assert.equal(computeMarks({ mcq: 4, short: 4, long: 2 }), 20);
});

test("يستخرج العام والفصل الدراسيين من التاريخ", () => {
  assert.deepEqual(getAcademicContext(new Date("2026-09-01T00:00:00Z")), {
    academicYear: "2026/2027",
    semester: "الأول",
  });
});

test("يرفض إعدادًا ناقصًا", () => {
  const validation = validateExamSetup(createEmptyDraft());
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.length >= 5);
});

test("يقبل إعدادًا كاملًا متوازن الدرجات", () => {
  const validation = validateExamSetup(completeDraft());
  assert.equal(validation.valid, true);
  assert.equal(validation.computedMarks, 20);
});

test("يبني خطة بعدد المفردات المطلوب وثلاثة مقترحات لكل مفردة", () => {
  const plan = buildPlan(completeDraft());
  assert.equal(plan.length, 10);
  assert.ok(plan.every((item) => item.proposals.length === 3));
});

test("لا تعد الخطة مكتملة قبل اختيار سؤال لكل مفردة", () => {
  const draft = completeDraft();
  draft.plan = buildPlan(draft);
  assert.equal(isPlanComplete(draft), false);
  for (const item of draft.plan) draft.selectedProposalByPlanItem[item.id] = item.proposals[0].id;
  assert.equal(isPlanComplete(draft), true);
});

test("اقتراح التوزيع يعيد عدد درجات مطابقًا للمجموع", () => {
  const counts = suggestCountsForMarks(20, "متقدم");
  assert.equal(computeMarks(counts), 20);
  assert.ok(counts.long >= 1);
});
