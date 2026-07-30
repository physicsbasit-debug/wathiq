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
  draft.topic = "الشحنة الكهربائية";
  draft.sourceReferences = [
    {
      id: "source-1:0",
      sourceId: "source-1",
      sourceTitle: "كتاب الطالب للفيزياء",
      sourceKind: "كتاب الطالب",
      pageFrom: 15,
      pageTo: 15,
      excerpt: "تنتج الشحنة الكهربائية عن انتقال الإلكترونات بين الأجسام.",
      score: 80,
    },
  ];
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

test("يقبل إعدادًا كاملًا مرتبطًا بمصدر مفهرس", () => {
  const validation = validateExamSetup(completeDraft());
  assert.equal(validation.valid, true);
  assert.equal(validation.computedMarks, 10);
});

test("يبني خطة بعدد المفردات المطلوب ويربطها بمرجع المصدر", () => {
  const plan = buildPlan(completeDraft());
  assert.equal(plan.length, 6);
  assert.ok(plan.every((item) => item.proposals.length === 0));
  assert.ok(plan.every((item) => item.sourceReferenceId === "source-1:0"));
  assert.equal(plan.reduce((sum, item) => sum + item.marks, 0), 10);
  assert.deepEqual(
    plan.reduce((counts, item) => {
      if (item.questionType === "اختيار من متعدد") counts.mcq += 1;
      else if (item.questionType === "إجابة قصيرة") counts.short += 1;
      else counts.long += 1;
      return counts;
    }, { mcq: 0, short: 0, long: 0 }),
    { mcq: 2, short: 3, long: 1 },
  );
  assert.deepEqual(
    plan.reduce((marks, item) => {
      marks[item.cognitiveLevel] += item.marks;
      return marks;
    }, { معرفة: 0, تطبيق: 0, استدلال: 0 }),
    { معرفة: 4, تطبيق: 4, استدلال: 2 },
  );
});

test("لا تعد الخطة مكتملة قبل اختيار صياغة لكل مفردة", () => {
  const draft = completeDraft();
  draft.plan = buildPlan(draft);
  assert.equal(isPlanComplete(draft), false);
  for (const item of draft.plan) {
    item.proposals = [{ id: `${item.id}-p1`, text: "سؤال موثق", answer: "إجابة" }];
    draft.selectedProposalByPlanItem[item.id] = item.proposals[0].id;
  }
  assert.equal(isPlanComplete(draft), true);
});

test("اقتراح التوزيع يعيد عدد درجات مطابقًا للمجموع", () => {
  const counts = suggestCountsForMarks(20, "متقدم");
  assert.equal(computeMarks(counts), 20);
  assert.ok(counts.long >= 1);
});
