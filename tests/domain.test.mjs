import test from "node:test";
import assert from "node:assert/strict";
import {
  approveExamDraft,
  buildPlan,
  computeMarks,
  createEmptyDraft,
  getAcademicContext,
  isPlanComplete,
  MAX_LESSON_TOPICS,
  MIN_LESSON_TOPICS,
  normalizeLessonTopics,
  reopenExamDraft,
  suggestCountsForMarks,
  syncDraftTopicFromLessons,
  validateExamSetup,
} from "../dist/assets/domain.js";

function completeDraft() {
  const draft = createEmptyDraft(new Date("2026-09-01T08:00:00Z"));
  draft.grade = 10;
  draft.subjectId = "physics";
  draft.lessonTopics = ["1-1 الشحنة الكهربائية", "1-2 التأثيرات الكهربائية"];
  syncDraftTopicFromLessons(draft);
  draft.sourceReferences = [
    {
      id: "source-1:0:lesson-1",
      sourceId: "source-1",
      sourceTitle: "كتاب الطالب للفيزياء",
      sourceKind: "كتاب الطالب",
      pageFrom: 15,
      pageTo: 15,
      excerpt: "تنتج الشحنة الكهربائية عن انتقال الإلكترونات بين الأجسام.",
      context: "تنتج الشحنة الكهربائية عن انتقال الإلكترونات بين الأجسام، وقد تكون موجبة أو سالبة.",
      lessonTopic: "1-1 الشحنة الكهربائية",
      score: 80,
    },
    {
      id: "source-1:1:lesson-2",
      sourceId: "source-1",
      sourceTitle: "كتاب الطالب للفيزياء",
      sourceKind: "كتاب الطالب",
      pageFrom: 18,
      pageTo: 18,
      excerpt: "تؤثر الأجسام المشحونة بعضها في بعض بقوى كهربائية.",
      context: "تؤثر الأجسام المشحونة بعضها في بعض بقوى تجاذب أو تنافر كهربائية.",
      lessonTopic: "1-2 التأثيرات الكهربائية",
      score: 78,
    },
  ];
  draft.title = "الاختبار القصير الأول";
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

test("ينشئ المسودة بصفين لإدخال الدروس ويحصرها بين درسين وخمسة", () => {
  const draft = createEmptyDraft();
  assert.deepEqual(draft.lessonTopics, ["", ""]);
  assert.equal(MIN_LESSON_TOPICS, 2);
  assert.equal(MAX_LESSON_TOPICS, 5);
  assert.deepEqual(normalizeLessonTopics([" 1-1 الضغط ", "", "1-2 الضغط في السوائل"]), ["1-1 الضغط", "1-2 الضغط في السوائل"]);
});

test("يرفض إعدادًا ناقصًا", () => {
  const validation = validateExamSetup(createEmptyDraft());
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.length >= 5);
});

test("يرفض درسًا مكررًا ولو اختلفت المسافات أو شكل الهمزة", () => {
  const draft = completeDraft();
  draft.lessonTopics = ["1-1 الشحنة الكهربائية", " 1-1 الشحنة الكهربائيّة "];
  syncDraftTopicFromLessons(draft);
  const validation = validateExamSetup(draft);
  assert.equal(validation.valid, false);
  assert.match(validation.issues.map((issue) => issue.message).join(" "), /لا تكرر الدرس نفسه/);
});

test("يقبل إعدادًا كاملًا مرتبطًا بمصدر مفهرس لكل درس", () => {
  const validation = validateExamSetup(completeDraft());
  assert.equal(validation.valid, true);
  assert.equal(validation.computedMarks, 10);
});

test("يبني خطة رسمية ويوزع مفرداتها على جميع الدروس ومراجعها", () => {
  const plan = buildPlan(completeDraft());
  assert.equal(plan.length, 6);
  assert.ok(plan.every((item) => item.proposals.length === 0));
  assert.deepEqual(new Set(plan.map((item) => item.lessonLabel)), new Set(["1-1 الشحنة الكهربائية", "1-2 التأثيرات الكهربائية"]));
  assert.deepEqual(new Set(plan.map((item) => item.sourceReferenceId)), new Set(["source-1:0:lesson-1", "source-1:1:lesson-2"]));
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

test("يرفض بناء الخطة إذا لم يرتبط أحد الدروس بمقطع مصدر", () => {
  const draft = completeDraft();
  draft.sourceReferences = draft.sourceReferences.slice(0, 1);
  assert.throws(() => buildPlan(draft), /غير مرتبط بمصدر مفهرس/);
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

test("يدعم خمسة دروس ويوزع عليها مفردات الصف العاشر كلها", () => {
  const draft = completeDraft();
  draft.lessonTopics = [
    "1-1 الشحنة الكهربائية",
    "1-2 التأثيرات الكهربائية",
    "1-3 المجال الكهربائي",
    "1-4 فرق الجهد",
    "1-5 التيار الكهربائي",
  ];
  syncDraftTopicFromLessons(draft);
  draft.sourceReferences = draft.lessonTopics.map((lessonTopic, index) => ({
    id: `source-1:${index}:lesson-${index + 1}`,
    sourceId: "source-1",
    sourceTitle: "كتاب الطالب للفيزياء",
    sourceKind: "كتاب الطالب",
    pageFrom: 15 + index,
    pageTo: 15 + index,
    excerpt: `نص علمي صريح للدرس ${lessonTopic}.`,
    context: `يعرض هذا المقطع مفهوم ${lessonTopic} وفق كتاب الطالب.`,
    lessonTopic,
    score: 80 - index,
  }));
  const plan = buildPlan(draft);
  assert.equal(plan.length, 6);
  assert.deepEqual(new Set(plan.map((item) => item.lessonLabel)), new Set(draft.lessonTopics));
});


test("يضع تاريخ اليوم وعنوان الاختبار القصير الأول تلقائيًا في المسودة الجديدة", () => {
  const draft = createEmptyDraft(new Date(2026, 6, 30, 9, 0, 0));
  assert.equal(draft.examDate, "2026-07-30");
  assert.equal(draft.title, "الاختبار القصير الأول");
  assert.equal(draft.assessmentType, "اختبار قصير رسمي");
});

test("يبني قالب الاختبار النهائي للصف العاشر عند اختياره", async () => {
  const { setExamTitle } = await import("../dist/assets/domain.js");
  const draft = completeDraft();
  setExamTitle(draft, "الاختبار النهائي");
  const validation = validateExamSetup(draft);
  assert.equal(validation.valid, true);
  assert.equal(draft.assessmentType, "امتحان نهاية الفصل الدراسي");
  assert.equal(draft.totalMarks, 60);
  assert.deepEqual(draft.counts, { mcq: 10, short: 22, long: 2 });
  const plan = buildPlan(draft);
  assert.equal(plan.length, 34);
  assert.equal(plan.reduce((sum, item) => sum + item.marks, 0), 60);
  assert.deepEqual(
    plan.reduce((marks, item) => {
      marks[item.difficultyLevel] += item.marks;
      return marks;
    }, { منخفض: 0, متوسط: 0, مرتفع: 0 }),
    { منخفض: 24, متوسط: 24, مرتفع: 12 },
  );
});


test("يعتمد الاختبار ثم يفتح نسخة المراجعة دون فقد الخطة", () => {
  const draft = completeDraft();
  draft.plan = buildPlan(draft);
  const planIds = draft.plan.map((item) => item.id);
  approveExamDraft(draft, "2026-09-15T10:00:00.000Z");
  assert.equal(draft.status, "معتمد");
  assert.equal(draft.approvedAt, "2026-09-15T10:00:00.000Z");
  assert.equal(draft.currentStep, 4);
  reopenExamDraft(draft);
  assert.equal(draft.status, "جاهز للمراجعة");
  assert.equal(draft.approvedAt, "");
  assert.deepEqual(draft.plan.map((item) => item.id), planIds);
});
