import assert from "node:assert/strict";
import test from "node:test";
import {
  AssessmentEngineError,
  MODEL_FORBIDDEN_OUTPUT_FIELDS,
  assertItemStatusTransition,
  assertModelOutputOwnership,
  buildAssessmentBlueprint,
  buildAssessmentItemContracts,
  deterministicNumericSeed,
  normalizeAssessmentModelContent,
  retryClassForErrorCode,
  reviewCompletedAssessment,
  stableHash64,
  stableStringify,
} from "../dist/assets/assessment-engine/index.js";

const sourceA = {
  sourceId: "source-1",
  sourceTitle: "كتاب الطالب",
  sourceKind: "كتاب الطالب",
  sourceReferenceId: "ref-1",
  chunkIndex: 17,
  pageFrom: 24,
  pageTo: 25,
  contentHash: "a".repeat(64),
  extractionVersion: "google-vision-v1",
};
const sourceB = {
  sourceId: "source-1",
  sourceTitle: "كتاب الطالب",
  sourceKind: "كتاب الطالب",
  sourceReferenceId: "ref-2",
  chunkIndex: 18,
  pageFrom: 26,
  pageTo: 27,
  contentHash: "b".repeat(64),
  extractionVersion: "google-vision-v1",
};

const items = [
  {
    planItemId: "plan-1",
    lessonId: "lesson-moment-1",
    lessonLabel: "عزم القوة",
    outcomeId: "outcome-moment-position",
    outcomeLabel: "يفسر أثر موضع القوة في دوران جسم",
    questionType: "اختيار من متعدد",
    cognitiveLevel: "تطبيق",
    difficultyLevel: "متوسط",
    marks: 1,
    sourceReferenceId: "ref-1",
    styleTarget: "سياقي",
    visualTarget: "context_scene",
    scenarioTarget: "door_handle",
    stimulusTarget: "real_life_scene",
    skillTarget: "apply",
    diversityKey: "context|door|apply|1",
    scientificContractKey: "moment",
    scientificRequirements: ["محور الدوران", "موضع تأثير القوة", "ذراع القوة"],
  },
  {
    planItemId: "plan-2",
    lessonId: "lesson-moment-2",
    lessonLabel: "اتزان العزوم",
    outcomeId: "outcome-moment-calculate",
    outcomeLabel: "يحسب عزم قوة حول محور",
    questionType: "إجابة قصيرة",
    cognitiveLevel: "استدلال",
    marks: 2,
    sourceReferenceId: "ref-2",
    styleTarget: "حسابي",
    visualTarget: "force_diagram",
    scenarioTarget: "wrench_tool",
    stimulusTarget: "scientific_diagram",
    skillTarget: "calculate",
    diversityKey: "calculation|wrench|calculate|2",
    scientificContractKey: "moment",
    scientificRequirements: ["القوة", "المسافة العمودية", "وحدة العزم"],
  },
];

async function buildBlueprint() {
  return buildAssessmentBlueprint({
    draftId: "draft-123",
    generationEpoch: 1,
    assessmentType: "اختبار قصير رسمي",
    assessmentPolicyId: "oman-science-2025-2026",
    grade: 10,
    subject: "الفيزياء",
    topic: "عزم القوة",
    difficulty: "متوسط",
    items,
    sourcesByReferenceId: new Map([
      [sourceA.sourceReferenceId, sourceA],
      [sourceB.sourceReferenceId, sourceB],
    ]),
  });
}

test("يبني مخططًا حتميًا من 1 إلى 40 مفردة مع هويات ومصدر صريح لكل مفردة", async () => {
  const blueprint = await buildBlueprint();
  assert.equal(blueprint.itemCount, 2);
  assert.equal(blueprint.totalMarks, 3);
  assert.equal(blueprint.items[0].lessonId, "lesson-moment-1");
  assert.equal(blueprint.items[0].outcomeId, "outcome-moment-position");
  assert.equal(blueprint.items[0].source.chunkIndex, 17);
  assert.equal(blueprint.items[1].source.chunkIndex, 18);
  assert.equal(blueprint.planHash.length, 64);
  assert.equal(blueprint.sourceSnapshotHash.length, 64);
  assert.notEqual(blueprint.planHash, blueprint.sourceSnapshotHash);
  assert.equal(blueprint.items[0].numericSeed, deterministicNumericSeed({
    planItemId: "plan-1",
    diversityKey: "context|door|apply|1",
  }));
});

test("يبني عقدًا مستقلًا ثابت الهوية لكل مفردة دون مشاركة مصدر الجيران", async () => {
  const contracts = await buildAssessmentItemContracts(await buildBlueprint());
  assert.equal(contracts.length, 2);
  assert.equal(contracts[0].planItemId, "plan-1");
  assert.equal(contracts[0].source.sourceReferenceId, "ref-1");
  assert.equal(contracts[1].source.sourceReferenceId, "ref-2");
  assert.equal(contracts[0].contractHash.length, 64);
  assert.notEqual(contracts[0].contractHash, contracts[1].contractHash);
  assert.deepEqual(contracts[0].scientificRequirements, ["محور الدوران", "موضع تأثير القوة", "ذراع القوة"]);
});

test("تنتج البصمة التمهيدية نفسها مهما اختلف ترتيب مفاتيح الكائن", () => {
  const left = { z: 3, a: { y: 2, x: 1 }, list: [3, 2, 1] };
  const right = { list: [3, 2, 1], a: { x: 1, y: 2 }, z: 3 };
  assert.equal(stableStringify(left), stableStringify(right));
  assert.equal(stableHash64(left), stableHash64(right));
});

test("يمنع النموذج من إعادة معرفات الخطة والمصدر والرسم والعقد العلمي", () => {
  for (const field of ["planItemId", "sourceEvidenceId", "sourceSupport", "visual", "scientificItem", "marks"]) {
    assert.ok(MODEL_FORBIDDEN_OUTPUT_FIELDS.includes(field));
  }
  assert.throws(
    () => assertModelOutputOwnership({ text: "سؤال", answer: "إجابة", sourceEvidenceId: "EV-2-1" }),
    (error) => error instanceof AssessmentEngineError && error.code === "MODEL_ASSESSMENT_MISMATCH",
  );
  assert.throws(
    () => assertModelOutputOwnership({ text: "سؤال", answer: "إجابة", arbitraryField: "غير مسموح" }),
    (error) => error instanceof AssessmentEngineError && error.code === "MODEL_ASSESSMENT_MISMATCH",
  );
});

test("يطبع محتوى النموذج محليًا ويثبت نقطة تصحيح مستقلة لكل درجة", async () => {
  const contract = (await buildAssessmentItemContracts(await buildBlueprint()))[1];
  assert.ok(contract);
  const normalized = normalizeAssessmentModelContent({
    stimulus: "  يوضح الشكل مفتاح ربط.  ",
    text: " احسب عزم القوة. ",
    options: [],
    answer: " 12 N m ",
    rationale: " العزم يساوي القوة في ذراعها. ",
    markScheme: ["يستخدم M = Fd", "يعوض ويكتب الوحدة"],
    needsReview: false,
  }, contract);
  assert.equal(normalized.text, "احسب عزم القوة.");
  assert.equal(normalized.markScheme.length, 2);
});

test("يرفض نقص نقاط التصحيح محليًا بدل تمريره إلى المسودة", async () => {
  const contract = (await buildAssessmentItemContracts(await buildBlueprint()))[1];
  assert.ok(contract);
  assert.throws(
    () => normalizeAssessmentModelContent({
      stimulus: "",
      text: "احسب العزم.",
      options: [],
      answer: "12 N m",
      rationale: "العزم يساوي القوة في ذراعها.",
      markScheme: ["يحسب العزم"],
      needsReview: false,
    }, contract),
    (error) => error instanceof AssessmentEngineError && error.code === "MODEL_ASSESSMENT_MISMATCH",
  );
});

test("يمنع انتقالات الحالات غير القانونية ويصنف المحاولات بحسب سبب الخطأ", () => {
  assert.doesNotThrow(() => assertItemStatusTransition("queued", "grounding"));
  assert.throws(() => assertItemStatusTransition("ready", "generating"));
  assert.equal(retryClassForErrorCode("MODEL_TIMEOUT"), "transport_once");
  assert.equal(retryClassForErrorCode("STALE_SOURCE"), "manual_source_refresh");
  assert.equal(retryClassForErrorCode("CANCELLED_BY_USER"), "none");
});

test("تكشف المراجعة العامة تكرار الصياغة والبيانات دون إعادة الاختبار كاملًا", () => {
  const resultBase = {
    contractHash: "c".repeat(64),
    evidence: { evidenceIndex: 0, evidenceHash: "e".repeat(64), excerpt: "العزم يساوي القوة في ذراعها", score: 1 },
    visual: {
      type: "none", title: "", altText: "", xAxisLabel: "", xAxisUnit: "", yAxisLabel: "", yAxisUnit: "",
      xMin: 0, xMax: 0, yMin: 0, yMax: 0, points: [], series: [], labels: [], values: [], components: [],
      annotations: [], tableColumns: [], tableRows: [], tableCells: [], hiddenCells: [], vectors: [],
    },
    model: "test-model",
    generatedAt: "2026-08-03T00:00:00.000Z",
    requestId: "request-1",
    durationMs: 100,
  };
  const conflicts = reviewCompletedAssessment([
    {
      ...resultBase,
      planItemId: "plan-1",
      content: {
        stimulus: "يؤثر طالب بقوة 10 N على باب على بعد 2 m من المفصل.",
        text: "احسب عزم القوة حول المفصل.", options: [], answer: "20 N m", rationale: "M=Fd",
        markScheme: ["يحسب العزم"], needsReview: false,
      },
    },
    {
      ...resultBase,
      planItemId: "plan-2",
      content: {
        stimulus: "يؤثر طالب بقوة 10 N على باب على بعد 2 m من المفصل.",
        text: "احسب عزم القوة حول المفصل.", options: [], answer: "20 N m", rationale: "M=Fd",
        markScheme: ["يحسب العزم"], needsReview: false,
      },
    },
  ]);
  assert.ok(conflicts.some((conflict) => conflict.kind === "duplicate_wording"));
});

test("يرفض مخططًا يتجاوز 40 مفردة قبل إنشاء أي مهمة", async () => {
  await assert.rejects(
    () => buildAssessmentBlueprint({
      draftId: "draft-too-large",
      generationEpoch: 1,
      assessmentType: "امتحان نهاية الفصل الدراسي",
      assessmentPolicyId: "oman-science-2025-2026",
      grade: 10,
      subject: "الفيزياء",
      topic: "اختبار شامل",
      difficulty: "متوسط",
      items: Array.from({ length: 41 }, (_, index) => ({
        ...items[0],
        planItemId: `plan-${index + 1}`,
        diversityKey: `seed-${index + 1}`,
      })),
      sourcesByReferenceId: new Map([[sourceA.sourceReferenceId, sourceA]]),
    }),
    (error) => error instanceof AssessmentEngineError && error.code === "INVALID_BLUEPRINT",
  );
});

test("يرفض المفردة التي لا تملك لقطة مصدر صريحة بدل استعارة مرجع مفردة أخرى", async () => {
  await assert.rejects(
    () => buildAssessmentBlueprint({
      draftId: "draft-missing-source",
      generationEpoch: 1,
      assessmentType: "اختبار قصير رسمي",
      assessmentPolicyId: "oman-science-2025-2026",
      grade: 10,
      subject: "الفيزياء",
      topic: "عزم القوة",
      difficulty: "متوسط",
      items: [{ ...items[0], sourceReferenceId: "missing-reference" }],
      sourcesByReferenceId: new Map([[sourceA.sourceReferenceId, sourceA]]),
    }),
    (error) => error instanceof AssessmentEngineError && error.code === "SOURCE_NOT_FOUND",
  );
});
