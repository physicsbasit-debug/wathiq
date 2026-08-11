import assert from "node:assert/strict";
import test from "node:test";
import {
  assertItemStatusTransition,
  assertModelOutputOwnership,
  buildAssessmentBlueprint,
  buildAssessmentItemContracts,
  retryClassForErrorCode,
} from "../dist/assets/assessment-engine/index.js";

function baseInput() {
  return {
    draftId: "draft-cambridge-1",
    generationEpoch: 2,
    assessmentType: "اختبار قصير",
    assessmentPolicyId: "oman-science-assessment-2025-2026-v1",
    programmeId: "lower_secondary",
    syllabusCode: "0893",
    stageLabel: "المرحلة 8",
    grade: 8,
    subject: "العلوم",
    topic: "القوى والحركة",
    difficulty: "متوسط",
    items: [{
      planItemId: "plan-1",
      lessonId: "topic-1",
      lessonLabel: "القوى والحركة",
      questionType: "إجابة قصيرة",
      cognitiveLevel: "تطبيق",
      assessmentFocus: "استقصاء علمي",
      marks: 2,
    }],
  };
}

test("يبني سياق كامبريدج العالمي تلقائيًا من المرحلة والمادة والموضوع", async () => {
  const blueprint = await buildAssessmentBlueprint(baseInput());
  assert.equal(blueprint.blueprintVersion, 4);
  assert.equal(blueprint.programmeId, "lower_secondary");
  assert.equal(blueprint.syllabusCode, "0893");
  assert.equal(blueprint.stageLabel, "المرحلة 8");
  assert.equal(blueprint.items[0].source.mode, "global_curriculum");
  assert.match(blueprint.items[0].source.sourceId, /0893/);
  assert.match(blueprint.items[0].source.contentHash, /^[0-9a-f]{64}$/);
});

test("عقد المفردة يحمل هوية كامبريدج ولا يحمل قيود التأليف القديمة", async () => {
  const blueprint = await buildAssessmentBlueprint(baseInput());
  const [contract] = await buildAssessmentItemContracts(blueprint);
  assert.equal(contract.contractVersion, 4);
  assert.equal(contract.programmeId, "lower_secondary");
  assert.equal(contract.syllabusCode, "0893");
  assert.equal(contract.stageLabel, "المرحلة 8");
  assert.equal(contract.assessmentFocus, "استقصاء علمي");
  for (const forbidden of ["styleTarget", "scenarioTarget", "visualTarget", "numericSeed", "scientificContractKey", "outcomeId", "outcomeLabel"]) {
    assert.equal(Object.hasOwn(contract, forbidden), false, forbidden);
  }
  assert.match(contract.contractHash, /^[0-9a-f]{64}$/);
});

test("النموذج يملك محتوى السؤال فقط ولا يستطيع تغيير عقد الاختبار", () => {
  assert.doesNotThrow(() => assertModelOutputOwnership({
    stimulus: "",
    text: "فسر سبب تسارع الجسم عند تأثير قوة محصلة فيه.",
    options: [],
    answer: "لأن وجود قوة محصلة يسبب تغيرًا في حركة الجسم.",
    rationale: "يقيس فهم أثر القوة المحصلة.",
    markScheme: ["يحدد وجود قوة محصلة.", "يربط القوة المحصلة بالتسارع."],
  }));
  assert.throws(() => assertModelOutputOwnership({
    stimulus: "", text: "سؤال", options: [], answer: "إجابة", rationale: "سبب", markScheme: ["درجة"], extraField: "غير مسموح",
  }));
});

test("يحمي انتقالات حالة التوليد", () => {
  assert.doesNotThrow(() => assertItemStatusTransition("queued", "grounding"));
  assert.throws(() => assertItemStatusTransition("ready", "generating"));
});

test("يصنف إعادة المحاولة حسب نوع الخطأ الحالي", () => {
  assert.equal(retryClassForErrorCode("MODEL_TIMEOUT"), "transport_once");
  assert.equal(retryClassForErrorCode("MODEL_INVALID_JSON"), "content_once");
  assert.equal(retryClassForErrorCode("AUTHORIZATION_FAILED"), "manual_authentication");
});
