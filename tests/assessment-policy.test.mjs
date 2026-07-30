import test from "node:test";
import assert from "node:assert/strict";
import {
  SCIENCE_ASSESSMENT_POLICY_ID,
  blueprintCognitiveMarks,
  blueprintCounts,
  blueprintDifficultyMarks,
  blueprintMarks,
  getOfficialFinalExamSpec,
  getOfficialShortTestSpec,
} from "../dist/assets/assessment-policy.js";

test("يثبت مرجع تقويم العلوم الرسمي للعام 2025/2026", () => {
  assert.equal(SCIENCE_ASSESSMENT_POLICY_ID, "oman-science-assessment-2025-2026");
  assert.equal(getOfficialShortTestSpec(4), null);
  assert.equal(getOfficialShortTestSpec(11), null);
});

test("تحقق قوالب الاختبار القصير الدرجات والأنواع والأهداف الرسمية", () => {
  for (const grade of [5, 6, 7, 8, 9, 10]) {
    const spec = getOfficialShortTestSpec(grade);
    assert.ok(spec);
    assert.equal(blueprintMarks(spec.blueprint), spec.totalMarks);
    assert.deepEqual(blueprintCounts(spec.blueprint), spec.counts);
    assert.deepEqual(blueprintCognitiveMarks(spec.blueprint), spec.cognitiveMarks);
    assert.ok(spec.blueprint.length >= spec.minItems && spec.blueprint.length <= spec.maxItems);
    for (const item of spec.blueprint) {
      if (item.questionType === "اختيار من متعدد") assert.equal(item.marks, 1);
      if (item.questionType === "إجابة قصيرة") assert.ok(item.marks === 1 || item.marks === 2);
      if (item.questionType === "إجابة طويلة") {
        assert.ok(grade >= 9);
        assert.ok(item.marks === 3 || item.marks === 4);
      }
    }
  }
});

test("قالب الصف العاشر يلتزم بمفردتي معرفة وتطبيق ومفردة طويلة واحدة", () => {
  const spec = getOfficialShortTestSpec(10);
  assert.ok(spec);
  const mcqLevels = spec.blueprint
    .filter((item) => item.questionType === "اختيار من متعدد")
    .map((item) => item.cognitiveLevel)
    .sort();
  assert.deepEqual(mcqLevels, ["تطبيق", "معرفة"].sort());
  assert.equal(spec.blueprint.filter((item) => item.questionType === "إجابة طويلة").length, 1);
  assert.deepEqual(spec.counts, { mcq: 2, short: 3, long: 1 });
  assert.deepEqual(spec.cognitiveMarks, { معرفة: 4, تطبيق: 4, استدلال: 2 });
});


test("تثبت قوالب الاختبار النهائي الرسمية للصفوف 5-10", () => {
  for (const grade of [5, 6, 7, 8, 9, 10]) {
    const spec = getOfficialFinalExamSpec(grade);
    assert.ok(spec);
    assert.equal(blueprintMarks(spec.blueprint), spec.totalMarks);
    assert.deepEqual(blueprintCounts(spec.blueprint), spec.counts);
    assert.deepEqual(blueprintCognitiveMarks(spec.blueprint), spec.cognitiveMarks);
    assert.deepEqual(blueprintDifficultyMarks(spec.blueprint), spec.difficultyMarks);
    assert.ok(spec.blueprint.length >= spec.minItems && spec.blueprint.length <= spec.maxItems);
    assert.equal(spec.counts.mcq, grade === 10 ? 10 : 8);
    if (grade <= 8) assert.equal(spec.counts.long, 0);
    else assert.ok(spec.counts.long >= 2);
  }
});

test("قالب الاختبار النهائي للصف العاشر يثبت 60 درجة و34 مفردة", () => {
  const spec = getOfficialFinalExamSpec(10);
  assert.ok(spec);
  assert.equal(spec.totalMarks, 60);
  assert.equal(spec.defaultDurationMinutes, 120);
  assert.equal(spec.blueprint.length, 34);
  assert.deepEqual(spec.counts, { mcq: 10, short: 22, long: 2 });
  assert.deepEqual(spec.cognitiveMarks, { معرفة: 24, تطبيق: 24, استدلال: 12 });
  assert.deepEqual(spec.difficultyMarks, { منخفض: 24, متوسط: 24, مرتفع: 12 });
});
