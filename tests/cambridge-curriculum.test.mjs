import test from "node:test";
import assert from "node:assert/strict";
import {
  CAMBRIDGE_PROGRAMMES,
  curriculumDisplayName,
  isStageValidForProgramme,
  stagesForProgramme,
  subjectsForProgramme,
  syllabusCodeFor,
} from "../dist/assets/cambridge-curriculum.js";
import {
  assessmentPreset,
  EXAM_TITLE_OPTIONS,
  suggestedCountsForMarks,
} from "../dist/assets/cambridge-assessment.js";

function computedMarks(counts) {
  return counts.mcq + counts.short * 2 + counts.long * 4;
}

test("يغطي مخطط Cambridge المراحل 1-6 للابتدائي و7-9 للإعدادي", () => {
  assert.deepEqual(stagesForProgramme("primary"), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(stagesForProgramme("lower_secondary"), [7, 8, 9]);
  assert.equal(isStageValidForProgramme("primary", 1), true);
  assert.equal(isStageValidForProgramme("primary", 6), true);
  assert.equal(isStageValidForProgramme("lower_secondary", 7), true);
  assert.equal(isStageValidForProgramme("lower_secondary", 8), true);
  assert.equal(isStageValidForProgramme("lower_secondary", 9), true);
  assert.equal(isStageValidForProgramme("lower_secondary", 6), false);
});

test("يستخدم أكواد Cambridge Science الصحيحة للمسارات المدعومة", () => {
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
});

test("يعرض هوية المنهج والمرحلة بوضوح", () => {
  assert.match(curriculumDisplayName("primary", "science", 4), /Cambridge Primary Science/);
  assert.match(curriculumDisplayName("primary", "science", 4), /Stage 4/);
  assert.match(curriculumDisplayName("primary", "science", 4), /0097/);
  assert.match(curriculumDisplayName("lower_secondary", "science", 8), /Stage 8/);
  assert.match(curriculumDisplayName("lower_secondary", "science", 8), /0893/);
  assert.match(curriculumDisplayName("igcse", "physics", 10), /0625/);
});

test("إعدادات الاختبار الافتراضية اقتراحات واثق داخلية ويمكن أن تتغير دون ادعاء أنها مواصفة Cambridge الرسمية", () => {
  assert.deepEqual(EXAM_TITLE_OPTIONS, ["اختبار قصير", "اختبار تدريبي", "اختبار شامل"]);
  for (const title of EXAM_TITLE_OPTIONS) {
    const preset = assessmentPreset(title);
    assert.equal(computedMarks(preset.counts), preset.totalMarks);
  }
  const custom = suggestedCountsForMarks(17, "متوسط");
  assert.equal(computedMarks(custom), 17);
  assert.equal(CAMBRIDGE_PROGRAMMES.length, 3);
});
