import test from "node:test";
import assert from "node:assert/strict";
import {
  approveExamDraft,
  buildPlan,
  computeMarks,
  createEmptyDraft,
  getAcademicYear,
  isPlanComplete,
  MAX_LESSON_TOPICS,
  MIN_LESSON_TOPICS,
  normalizeLessonTopics,
  reopenExamDraft,
  setCambridgeProgramme,
  setCambridgeSubject,
  setExamTitle,
  syncDraftTopicFromLessons,
  validateExamSetup,
} from "../dist/assets/domain.js";

function completePrimaryDraft() {
  const draft = createEmptyDraft(new Date("2026-09-01T08:00:00Z"));
  draft.programmeId = "primary";
  draft.grade = 5;
  draft.subjectId = "science";
  draft.syllabusCode = "0097";
  draft.lessonTopics = ["Forces and motion"];
  syncDraftTopicFromLessons(draft);
  draft.examDate = "2026-09-15";
  return draft;
}

function completeLowerDraft(stage = 8) {
  const draft = createEmptyDraft(new Date("2026-09-01T08:00:00Z"));
  setCambridgeProgramme(draft, "lower_secondary");
  draft.grade = stage;
  draft.lessonTopics = ["Forces and energy"];
  syncDraftTopicFromLessons(draft);
  draft.examDate = "2026-09-15";
  return draft;
}

function completeIgcsePhysicsDraft() {
  const draft = createEmptyDraft(new Date("2026-09-01T08:00:00Z"));
  setCambridgeProgramme(draft, "igcse");
  setCambridgeSubject(draft, "physics");
  draft.lessonTopics = ["Static electricity", "Electric fields"];
  syncDraftTopicFromLessons(draft);
  draft.examDate = "2026-09-15";
  return draft;
}

test("ينشئ واثق افتراضيًا مسودة Cambridge Primary Science بلا مصدر مطلوب", () => {
  const draft = createEmptyDraft(new Date("2026-09-01T08:00:00Z"));
  assert.equal(draft.programmeId, "primary");
  assert.equal(draft.grade, 1);
  assert.equal(draft.subjectId, "science");
  assert.equal(draft.syllabusCode, "0097");
  assert.deepEqual(draft.sourceReferences, []);
  assert.equal(draft.title, "اختبار قصير");
});

test("يحسب درجات أنواع الأسئلة", () => {
  assert.equal(computeMarks({ mcq: 4, short: 4, long: 2 }), 20);
});

test("يستخرج العام الأكاديمي للعرض فقط دون فصل دراسي محلي", () => {
  assert.equal(getAcademicYear(new Date("2026-09-01T00:00:00Z")), "2026/2027");
});

test("يدعم من موضوع واحد إلى خمسة موضوعات حرة", () => {
  assert.equal(MIN_LESSON_TOPICS, 1);
  assert.equal(MAX_LESSON_TOPICS, 5);
  assert.deepEqual(normalizeLessonTopics([" Forces ", "", "Energy"]), ["Forces", "Energy"]);
});

test("يقبل Cambridge Primary بلا كتاب أو دليل مرفوع", () => {
  const draft = completePrimaryDraft();
  const validation = validateExamSetup(draft);
  assert.equal(validation.valid, true, validation.issues.map((issue) => issue.message).join(" | "));
  assert.equal(validation.computedMarks, 10);
});

test("يغطي Stage 8 ضمن Cambridge Lower Secondary بلا مصدر مرفوع", () => {
  const draft = completeLowerDraft(8);
  const validation = validateExamSetup(draft);
  assert.equal(validation.valid, true, validation.issues.map((issue) => issue.message).join(" | "));
  assert.equal(draft.syllabusCode, "0893");
});

test("يدعم IGCSE Physics 0625 من عنوان الموضوع فقط", () => {
  const draft = completeIgcsePhysicsDraft();
  const validation = validateExamSetup(draft);
  assert.equal(validation.valid, true, validation.issues.map((issue) => issue.message).join(" | "));
  assert.equal(draft.syllabusCode, "0625");
});

test("يرفض مرحلة لا تنتمي للمسار", () => {
  const draft = completeLowerDraft(6);
  const validation = validateExamSetup(draft);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.field === "grade"));
});

test("يرفض موضوعًا مكررًا بعد التطبيع العربي", () => {
  const draft = completeIgcsePhysicsDraft();
  draft.lessonTopics = ["الشحنة الكهربائية", "  الشحنة الكهربائيّة  "];
  syncDraftTopicFromLessons(draft);
  const validation = validateExamSetup(draft);
  assert.equal(validation.valid, false);
  assert.match(validation.issues.map((issue) => issue.message).join(" "), /لا تكرر/);
});

test("يبني خطة كاملة بلا sourceReferenceId عندما لا يرفع المستخدم مصدرًا", () => {
  const draft = completeIgcsePhysicsDraft();
  const plan = buildPlan(draft);
  assert.equal(plan.length, 6);
  assert.equal(plan.reduce((sum, item) => sum + item.marks, 0), 10);
  assert.ok(plan.every((item) => item.sourceReferenceId === undefined));
  assert.deepEqual(new Set(plan.map((item) => item.lessonLabel)), new Set(draft.lessonTopics));
});

test("يحافظ على المصدر الاختياري إذا اختار المستخدم تعزيزه بملف مرفوع", () => {
  const draft = completeIgcsePhysicsDraft();
  draft.sourceReferences = [{
    id: "source-1:0",
    sourceId: "source-1",
    sourceTitle: "Optional physics reference",
    sourceKind: "كتاب الطالب",
    pageFrom: 10,
    pageTo: 10,
    excerpt: "Static charges exert forces on one another.",
    context: "Static electricity context.",
    lessonTopic: "Static electricity",
    score: 80,
  }];
  const plan = buildPlan(draft);
  const staticItems = plan.filter((item) => item.lessonLabel === "Static electricity");
  assert.ok(staticItems.some((item) => item.sourceReferenceId === "source-1:0"));
  assert.ok(plan.some((item) => item.sourceReferenceId === undefined));
});

test("تغيير نوع الاختبار مجرد إعداد افتراضي ويمكن للمستخدم تعديله لاحقًا", () => {
  const draft = completePrimaryDraft();
  setExamTitle(draft, "اختبار شامل");
  assert.equal(draft.title, "اختبار شامل");
  assert.equal(draft.totalMarks, 40);
  assert.equal(computeMarks(draft.counts), 40);
});

test("اعتماد الاختبار وإعادة فتحه لا يفقد الخطة", () => {
  const draft = completePrimaryDraft();
  draft.plan = buildPlan(draft);
  const ids = draft.plan.map((item) => item.id);
  approveExamDraft(draft, "2026-09-15T10:00:00.000Z");
  assert.equal(draft.status, "معتمد");
  reopenExamDraft(draft);
  assert.equal(draft.status, "جاهز للمراجعة");
  assert.deepEqual(draft.plan.map((item) => item.id), ids);
});

test("لا تعد الخطة مكتملة قبل وجود صياغة مختارة لكل مفردة", () => {
  const draft = completePrimaryDraft();
  draft.plan = buildPlan(draft);
  assert.equal(isPlanComplete(draft), false);
  for (const item of draft.plan) {
    item.proposals = [{ id: `${item.id}-p1`, text: "سؤال علمي", answer: "إجابة علمية" }];
    draft.selectedProposalByPlanItem[item.id] = item.proposals[0].id;
  }
  assert.equal(isPlanComplete(draft), true);
});
