import assert from "node:assert/strict";
import test from "node:test";
import {
  AssessmentEngineError,
  MODEL_FORBIDDEN_OUTPUT_FIELDS,
  assertItemStatusTransition,
  assertModelOutputOwnership,
  buildAssessmentBlueprint,
  buildAssessmentItemContracts,
  retryClassForErrorCode,
  sha256Hex,
} from "../dist/assets/assessment-engine/index.js";

function baseInput() {
  return {
    draftId: "draft-cambridge-1",
    generationEpoch: 2,
    assessmentType: "اختبار قصير",
    assessmentPolicyId: "wathiq-cambridge-science-quality-v1",
    programmeId: "lower_secondary",
    syllabusCode: "0893",
    stageLabel: "Stage 8",
    grade: 8,
    subject: "العلوم",
    topic: "Forces",
    difficulty: "متوسط",
    items: [{
      planItemId: "plan-1",
      lessonId: "topic-1",
      lessonLabel: "Forces",
      questionType: "إجابة قصيرة",
      cognitiveLevel: "تطبيق",
      marks: 2,
    }],
    sourcesByReferenceId: new Map(),
  };
}

test("يبني مصدر Cambridge عالميًا تلقائيًا عندما لا يرفع المستخدم ملفًا", async () => {
  const blueprint = await buildAssessmentBlueprint(baseInput());
  assert.equal(blueprint.blueprintVersion, 3);
  assert.equal(blueprint.programmeId, "lower_secondary");
  assert.equal(blueprint.syllabusCode, "0893");
  assert.equal(blueprint.stageLabel, "Stage 8");
  assert.equal(blueprint.items[0].source.mode, "global_curriculum");
  assert.match(blueprint.items[0].source.sourceId, /0893/);
  assert.match(blueprint.items[0].source.contentHash, /^[0-9a-f]{64}$/);
});

test("يحافظ على المصدر المرفوع الاختياري حرفيًا إذا رُبط بالمفردة", async () => {
  const input = baseInput();
  input.items[0].sourceReferenceId = "ref-1";
  const source = {
    mode: "uploaded_source",
    sourceId: "source-1",
    sourceTitle: "Teacher guide",
    sourceKind: "دليل المعلم",
    sourceReferenceId: "ref-1",
    chunkIndex: 3,
    pageFrom: 22,
    pageTo: 23,
    contentHash: await sha256Hex("source body"),
    extractionVersion: "pdf-text-v1",
  };
  input.sourcesByReferenceId = new Map([["ref-1", source]]);
  const blueprint = await buildAssessmentBlueprint(input);
  assert.deepEqual(blueprint.items[0].source, source);
});

test("يرفض مرجعًا اختياريًا مذكورًا في الخطة إذا كان غير موجود", async () => {
  const input = baseInput();
  input.items[0].sourceReferenceId = "missing";
  await assert.rejects(() => buildAssessmentBlueprint(input), (error) => {
    assert.ok(error instanceof AssessmentEngineError);
    assert.equal(error.code, "SOURCE_NOT_FOUND");
    return true;
  });
});

test("عقد المفردة يحمل هوية Cambridge ولا يحمل قوالب تأليف قديمة", async () => {
  const blueprint = await buildAssessmentBlueprint(baseInput());
  const [contract] = await buildAssessmentItemContracts(blueprint);
  assert.equal(contract.contractVersion, 3);
  assert.equal(contract.programmeId, "lower_secondary");
  assert.equal(contract.syllabusCode, "0893");
  assert.equal(contract.stageLabel, "Stage 8");
  for (const forbidden of ["styleTarget", "scenarioTarget", "visualTarget", "numericSeed", "scientificContractKey", "outcomeId", "outcomeLabel"]) {
    assert.equal(Object.hasOwn(contract, forbidden), false, forbidden);
  }
  assert.match(contract.contractHash, /^[0-9a-f]{64}$/);
});

test("النموذج يملك محتوى السؤال فقط ولا يملك هوية الخطة أو المصدر", () => {
  assert.doesNotThrow(() => assertModelOutputOwnership({
    stimulus: "",
    text: "Explain why the object accelerates.",
    options: [],
    answer: "Because there is a resultant force.",
    rationale: "Tests force and motion understanding.",
    markScheme: ["Identifies a resultant force.", "Links force to acceleration."],
  }));
  for (const field of MODEL_FORBIDDEN_OUTPUT_FIELDS.slice(0, 5)) {
    assert.throws(() => assertModelOutputOwnership({
      stimulus: "", text: "Q", options: [], answer: "A", rationale: "R", markScheme: ["M"], [field]: "owned-by-model",
    }));
  }
});

test("يحمي انتقالات حالة التوليد", () => {
  assert.doesNotThrow(() => assertItemStatusTransition("queued", "grounding"));
  assert.throws(() => assertItemStatusTransition("ready", "generating"));
});

test("يصنف إعادة المحاولة حسب نوع الخطأ", () => {
  assert.equal(retryClassForErrorCode("MODEL_TIMEOUT"), "transport_once");
  assert.equal(retryClassForErrorCode("MODEL_INVALID_JSON"), "content_once");
  assert.equal(retryClassForErrorCode("SOURCE_ACCESS_DENIED"), "manual_authentication");
});
