import test from "node:test";
import assert from "node:assert/strict";
import {
  CAMBRIDGE_PROGRAMMES,
  CAMBRIDGE_LEVEL_OPTIONS,
  curriculumDisplayName,
  isStageValidForProgramme,
  stagesForProgramme,
  subjectsForProgramme,
  syllabusCodeFor,
  topicsForSelection,
} from "../dist/assets/cambridge-curriculum.js";
import {
  assessmentSpecification,
  buildAssessmentEntries,
  cognitiveLevelsForEntries,
  difficultyLevelsForEntries,
  inquiryFlagsForEntries,
  EXAM_TITLE_OPTIONS,
} from "../dist/assets/cambridge-assessment.js";

function marksByLabel(entries, labels, target) {
  return entries.reduce((sum, entry, index) => sum + (labels[index] === target ? entry.marks : 0), 0);
}

test("يغطي مخطط كامبريدج الصفوف 1-6 للابتدائي و7-9 للإعدادي والصف 10 لـ IGCSE", () => {
  assert.deepEqual(stagesForProgramme("primary"), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(stagesForProgramme("lower_secondary"), [7, 8, 9]);
  assert.equal(isStageValidForProgramme("primary", 1), true);
  assert.equal(isStageValidForProgramme("primary", 6), true);
  assert.equal(isStageValidForProgramme("lower_secondary", 8), true);
  assert.equal(isStageValidForProgramme("lower_secondary", 6), false);
  assert.equal(isStageValidForProgramme("igcse", 10), true);
  assert.equal(CAMBRIDGE_LEVEL_OPTIONS.at(-1)?.id, "igcse:10");
  assert.equal(CAMBRIDGE_LEVEL_OPTIONS.at(-1)?.stage, 10);
});

test("يستخدم أكواد علوم كامبريدج الصحيحة للمسارات المدعومة", () => {
  assert.equal(syllabusCodeFor("primary", "science"), "0097");
  assert.equal(syllabusCodeFor("lower_secondary", "science"), "0893");
  assert.equal(syllabusCodeFor("igcse", "physics"), "0625");
  assert.equal(syllabusCodeFor("igcse", "chemistry"), "0620");
  assert.equal(syllabusCodeFor("igcse", "biology"), "0610");
  assert.equal(syllabusCodeFor("igcse", "combined_science"), "0653");
  assert.equal(syllabusCodeFor("igcse", "coordinated_sciences"), "0654");
});

test("لا يعرض مواد غير العلوم داخل أي مسار", () => {
  assert.deepEqual(subjectsForProgramme("primary").map((item) => item.id), ["science"]);
  assert.deepEqual(subjectsForProgramme("lower_secondary").map((item) => item.id), ["science"]);
  assert.deepEqual(subjectsForProgramme("igcse").map((item) => item.id), [
    "physics", "chemistry", "biology", "combined_science", "coordinated_sciences",
  ]);
  assert.equal(CAMBRIDGE_PROGRAMMES.length, 3);
});

test("يعرض هوية المنهج والصف بوضوح", () => {
  assert.match(curriculumDisplayName("primary", "science", 4), /المرحلة 4/);
  assert.match(curriculumDisplayName("primary", "science", 4), /0097/);
  assert.match(curriculumDisplayName("lower_secondary", "science", 8), /المرحلة 8/);
  assert.match(curriculumDisplayName("lower_secondary", "science", 8), /0893/);
  assert.match(curriculumDisplayName("igcse", "physics", 10), /الصف 10/);
  assert.match(curriculumDisplayName("igcse", "physics", 10), /0625/);
});

test("قائمة فيزياء الصف العاشر تطابق فهرس الكتاب المحلي المرفوع", () => {
  const topics = topicsForSelection("igcse", "physics", 10);
  assert.equal(topics.length, 46);
  assert.equal(new Set(topics.map((item) => item.strand)).size, 19);
  const labels = topics.map((item) => item.label);
  for (const required of [
    "الكهرباء الساكنة",
    "الاحتكاك والشحن الكهربائي",
    "مكونات الدائرة الكهربائية",
    "القوة والكتلة والتسارع",
    "قانون هوك",
    "حساب عزم القوة",
    "حساب الضغط",
    "عمر النصف للمادة المشعة",
    "السرعة والتردد وطول الموجة",
    "الموجات الكهرومغناطيسية",
    "سرعة الصوت",
    "المجالات المغناطيسية",
    "التأثير المغناطيسي لتيار كهربائي",
    "المحركات الكهربائية",
    "توليد الكهرباء",
    "خطوط الطاقة الكهربائية والمحولات",
  ]) assert.ok(labels.includes(required), required);
});

test("عناوين الاختبار الثلاثة الرسمية موجودة", () => {
  assert.deepEqual(EXAM_TITLE_OPTIONS, ["الاختبار القصير الأول", "الاختبار القصير الثاني", "الاختبار النهائي"]);
});

test("جدول الصف العاشر القصير يحقق المواصفة التشغيلية 10 درجات و6 مفردات", () => {
  const spec = assessmentSpecification(10, "الاختبار القصير الأول");
  const entries = buildAssessmentEntries(spec);
  const levels = cognitiveLevelsForEntries(entries, spec);
  assert.equal(spec.totalMarks, 10);
  assert.equal(spec.itemCountMin, 5);
  assert.equal(spec.itemCountMax, 7);
  assert.equal(entries.length, 6);
  assert.deepEqual(spec.counts, { mcq: 2, short: 3, long: 1 });
  assert.equal(entries.reduce((sum, item) => sum + item.marks, 0), 10);
  assert.equal(marksByLabel(entries, levels, "معرفة"), 4);
  assert.equal(marksByLabel(entries, levels, "تطبيق"), 4);
  assert.equal(marksByLabel(entries, levels, "استدلال"), 2);
  assert.equal(spec.durationOfficial, false);
});

test("جدول الصف العاشر النهائي يبني 60 درجة و34 مفردة و40/40/20 بدقة", () => {
  const spec = assessmentSpecification(10, "الاختبار النهائي");
  const entries = buildAssessmentEntries(spec);
  const levels = cognitiveLevelsForEntries(entries, spec);
  const difficulty = difficultyLevelsForEntries(entries, spec);
  const inquiry = inquiryFlagsForEntries(entries, spec);
  assert.equal(spec.totalMarks, 60);
  assert.equal(spec.durationMinutes, 120);
  assert.equal(spec.durationOfficial, true);
  assert.equal(spec.itemCountMin, 30);
  assert.equal(spec.itemCountMax, 40);
  assert.equal(entries.length, 34);
  assert.deepEqual(spec.counts, { mcq: 10, short: 22, long: 2 });
  assert.equal(entries.filter((item) => item.type === "اختيار من متعدد").length, 10);
  assert.equal(entries.filter((item) => item.type === "إجابة طويلة").length, 2);
  assert.equal(entries.reduce((sum, item) => sum + item.marks, 0), 60);
  assert.equal(marksByLabel(entries, levels, "معرفة"), 24);
  assert.equal(marksByLabel(entries, levels, "تطبيق"), 24);
  assert.equal(marksByLabel(entries, levels, "استدلال"), 12);
  assert.equal(marksByLabel(entries, difficulty, "منخفض"), 24);
  assert.equal(marksByLabel(entries, difficulty, "متوسط"), 24);
  assert.equal(marksByLabel(entries, difficulty, "مرتفع"), 12);
  assert.equal(entries.reduce((sum, item, i) => sum + (inquiry[i] ? item.marks : 0), 0), 10);
});

test("الاختبار النهائي للصفوف 5-8 والصف 9 يحافظ على جدول المواصفات", () => {
  const grade8 = assessmentSpecification(8, "الاختبار النهائي");
  const grade9 = assessmentSpecification(9, "الاختبار النهائي");
  assert.deepEqual(grade8.counts, { mcq: 8, short: 17, long: 0 });
  assert.equal(grade8.totalMarks, 40);
  assert.equal(grade8.operationalItemCount, 25);
  assert.deepEqual(grade9.counts, { mcq: 8, short: 15, long: 2 });
  assert.equal(grade9.totalMarks, 40);
  assert.equal(grade9.operationalItemCount, 25);
});
