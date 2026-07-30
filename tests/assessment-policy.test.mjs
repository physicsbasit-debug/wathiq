import test from "node:test";
import assert from "node:assert/strict";
import {
  SCIENCE_ASSESSMENT_POLICY_ID,
  blueprintCognitiveMarks,
  blueprintCounts,
  blueprintMarks,
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
