import test from "node:test";
import assert from "node:assert/strict";
import {
  approveExamDraft,
  applyAssessmentPreset,
  buildPlan,
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

function completePrimaryDraft(grade = 5) {
  const draft = createEmptyDraft(new Date("2026-09-01T08:00:00Z"));
  draft.programmeId = "primary";
  draft.grade = grade;
  draft.subjectId = "science";
  draft.syllabusCode = "0097";
  applyAssessmentPreset(draft);
  draft.lessonTopics = ["القوى ومخططات القوى"];
  syncDraftTopicFromLessons(draft);
  draft.examDate = "2026-09-15";
  return draft;
}

function completeLowerDraft(stage = 8) {
  const draft = createEmptyDraft(new Date("2026-09-01T08:00:00Z"));
  setCambridgeProgramme(draft, "lower_secondary");
  draft.grade = stage;
  setCambridgeSubject(draft, "science");
  applyAssessmentPreset(draft);
  draft.lessonTopics = ["القوى المتزنة وغير المتزنة"];
  syncDraftTopicFromLessons(draft);
  draft.examDate = "2026-09-15";
  return draft;
}

function completeIgcsePhysicsDraft() {
  const draft = createEmptyDraft(new Date("2026-09-01T08:00:00Z"));
  setCambridgeProgramme(draft, "igcse");
  draft.grade = 10;
  setCambridgeSubject(draft, "physics");
  applyAssessmentPreset(draft);
  draft.lessonTopics = ["الكهرباء الساكنة", "الاحتكاك والشحن الكهربائي"];
  syncDraftTopicFromLessons(draft);
  draft.examDate = "2026-09-15";
  return draft;
}

function markSum(plan, predicate) {
  return plan.reduce((sum, item) => sum + (predicate(item) ? item.marks : 0), 0);
}

test("ينشئ واثق افتراضيًا مسودة علوم كامبريدج عربية من دون ملفات", () => {
  const draft = createEmptyDraft(new Date("2026-09-01T08:00:00Z"));
  assert.equal(draft.programmeId, "primary");
  assert.equal(draft.grade, 1);
  assert.equal(draft.subjectId, "science");
  assert.equal(draft.syllabusCode, "0097");
  assert.equal(draft.title, "الاختبار القصير الأول");
  assert.equal("sourceReferences" in draft, false);
});

test("يستخرج العام الأكاديمي للعرض فقط", () => {
  assert.equal(getAcademicYear(new Date("2026-09-01T00:00:00Z")), "2026/2027");
});

test("يدعم من موضوع واحد إلى خمسة موضوعات مختارة", () => {
  assert.equal(MIN_LESSON_TOPICS, 1);
  assert.equal(MAX_LESSON_TOPICS, 5);
  assert.deepEqual(normalizeLessonTopics([" القوى ", "", "الطاقة"]), ["القوى", "الطاقة"]);
});

test("يقبل الصف الخامس من موضوع مطابق ويطبق جدول الاختبار القصير تلقائيًا", () => {
  const draft = completePrimaryDraft(5);
  const validation = validateExamSetup(draft);
  assert.equal(validation.valid, true, validation.issues.map((issue) => issue.message).join(" | "));
  assert.equal(validation.computedMarks, 15);
  assert.equal(draft.counts.mcq + draft.counts.short + draft.counts.long, 10);
});

test("يغطي الصف 8 ضمن Cambridge Lower Secondary بجدول الصفوف 5-8", () => {
  const draft = completeLowerDraft(8);
  const validation = validateExamSetup(draft);
  assert.equal(validation.valid, true, validation.issues.map((issue) => issue.message).join(" | "));
  assert.equal(draft.syllabusCode, "0893");
  assert.equal(draft.totalMarks, 15);
});

test("يدعم الصف 10 فيزياء 0625 من موضوعات كتاب الصف العاشر", () => {
  const draft = completeIgcsePhysicsDraft();
  const validation = validateExamSetup(draft);
  assert.equal(validation.valid, true, validation.issues.map((issue) => issue.message).join(" | "));
  assert.equal(draft.syllabusCode, "0625");
  assert.equal(draft.grade, 10);
  assert.equal(draft.totalMarks, 10);
});

test("يرفض مرحلة لا تنتمي للمسار", () => {
  const draft = completeLowerDraft(8);
  draft.grade = 6;
  const validation = validateExamSetup(draft);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.field === "grade"));
});

test("يرفض موضوعًا مكررًا بعد التطبيع العربي", () => {
  const draft = completeIgcsePhysicsDraft();
  draft.lessonTopics = ["الكهرباء والمغناطيسية", "  الكهرباء والمغناطيسيّة  "];
  syncDraftTopicFromLessons(draft);
  const validation = validateExamSetup(draft);
  assert.equal(validation.valid, false);
  assert.match(validation.issues.map((issue) => issue.message).join(" "), /لا تكرر/);
});

test("يبني خطة الصف 10 القصيرة وفق 10 درجات و40/40/20", () => {
  const draft = completeIgcsePhysicsDraft();
  const plan = buildPlan(draft);
  assert.equal(plan.length, 6);
  assert.equal(plan.reduce((sum, item) => sum + item.marks, 0), 10);
  assert.equal(markSum(plan, (item) => item.cognitiveLevel === "معرفة"), 4);
  assert.equal(markSum(plan, (item) => item.cognitiveLevel === "تطبيق"), 4);
  assert.equal(markSum(plan, (item) => item.cognitiveLevel === "استدلال"), 2);
  assert.ok(plan.every((item) => !('sourceReferenceId' in item)));
  assert.deepEqual(new Set(plan.map((item) => item.lessonLabel)), new Set(draft.lessonTopics));
  const mcq = plan.filter((item) => item.questionType === "اختيار من متعدد");
  const long = plan.find((item) => item.questionType === "إجابة طويلة");
  assert.deepEqual(mcq.map((item) => item.cognitiveLevel), ["معرفة", "تطبيق"]);
  assert.equal(long?.marks, 3);
  assert.equal(plan.reduce((sum, item) => sum + item.marks, 0), 10);
});

test("يبني الاختبار النهائي للصف 10 من جدول المواصفات لا من أعداد يدوية", () => {
  const draft = completeIgcsePhysicsDraft();
  setExamTitle(draft, "الاختبار النهائي");
  const validation = validateExamSetup(draft);
  assert.equal(validation.valid, true, validation.issues.map((issue) => issue.message).join(" | "));
  const plan = buildPlan(draft);
  assert.equal(draft.totalMarks, 60);
  assert.equal(draft.durationMinutes, 120);
  assert.deepEqual(draft.counts, { mcq: 10, short: 22, long: 2 });
  assert.equal(plan.length, 34);
  assert.equal(plan.reduce((sum, item) => sum + item.marks, 0), 60);
  assert.equal(markSum(plan, (item) => item.cognitiveLevel === "معرفة"), 24);
  assert.equal(markSum(plan, (item) => item.cognitiveLevel === "تطبيق"), 24);
  assert.equal(markSum(plan, (item) => item.cognitiveLevel === "استدلال"), 12);
  assert.equal(markSum(plan, (item) => item.difficultyLevel === "منخفض"), 24);
  assert.equal(markSum(plan, (item) => item.difficultyLevel === "متوسط"), 24);
  assert.equal(markSum(plan, (item) => item.difficultyLevel === "مرتفع"), 12);
  assert.equal(markSum(plan, (item) => item.assessmentFocus === "استقصاء علمي"), 10);
});

test("تغيير عنوان الاختبار يطبق المواصفة الجديدة تلقائيًا", () => {
  const draft = completePrimaryDraft(5);
  setExamTitle(draft, "الاختبار النهائي");
  assert.equal(draft.title, "الاختبار النهائي");
  assert.equal(draft.totalMarks, 40);
  assert.equal(draft.durationMinutes, 90);
  assert.deepEqual(draft.counts, { mcq: 8, short: 17, long: 0 });
});

test("اعتماد الاختبار وإعادة فتحه لا يفقد الخطة", () => {
  const draft = completePrimaryDraft(5);
  draft.plan = buildPlan(draft);
  const ids = draft.plan.map((item) => item.id);
  approveExamDraft(draft, "2026-09-15T10:00:00.000Z");
  assert.equal(draft.status, "معتمد");
  reopenExamDraft(draft);
  assert.equal(draft.status, "جاهز للمراجعة");
  assert.deepEqual(draft.plan.map((item) => item.id), ids);
});

test("لا تعد الخطة مكتملة قبل وجود صياغة مختارة لكل مفردة", () => {
  const draft = completePrimaryDraft(5);
  draft.plan = buildPlan(draft);
  assert.equal(isPlanComplete(draft), false);
  for (const item of draft.plan) {
    item.proposals = [{ id: `${item.id}-p1`, text: "سؤال علمي", answer: "إجابة علمية" }];
    draft.selectedProposalByPlanItem[item.id] = item.proposals[0].id;
  }
  assert.equal(isPlanComplete(draft), true);
});
