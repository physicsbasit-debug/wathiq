import test from "node:test";
import assert from "node:assert/strict";
import {
  ASSESSMENT_GENERATION_V2_VERSION,
  applyWholeExamQuestionsV2,
  buildAssessmentBlueprintV2,
  buildLessonCardsV2,
  buildWholeExamGenerationRequestV2,
  parseWholeExamGenerationResponseV2,
} from "../dist/assets/assessment-generation-v2.js";

function planItem(id, lessonLabel, sourceReferenceId, outcomeLabel, cognitiveLevel = "معرفة") {
  return {
    id,
    lessonId: `lesson-${id}`,
    lessonLabel,
    outcomeId: `outcome-${id}`,
    outcomeLabel,
    cognitiveLevel,
    questionType: "اختيار من متعدد",
    marks: 1,
    sourceReferenceId,
    proposals: [],
  };
}

function references() {
  return [
    {
      id: "ref-1", sourceId: "student-book", sourceTitle: "كتاب الطالب", sourceKind: "كتاب الطالب",
      pageFrom: 20, pageTo: 21, excerpt: "يؤثر موضع القوة في مقدار عزم الدوران.",
      context: "يزداد عزم القوة بزيادة القوة أو المسافة العمودية عن محور الدوران.", lessonTopic: "عزم القوة", score: 98,
    },
    {
      id: "ref-2", sourceId: "teacher-guide", sourceTitle: "دليل المعلم", sourceKind: "دليل المعلم",
      pageFrom: 30, pageTo: 31, excerpt: "يفسر الطالب شروط الاتزان.",
      context: "يتحقق الاتزان عندما تتساوى محصلة القوى وتتعادل عزوم الدوران.", lessonTopic: "الاتزان", score: 97,
    },
  ];
}

function noVisual() {
  return {
    type: "none", visualId: "", variant: "default", purpose: "", role: "read", title: "", altText: "",
    xAxisLabel: "", xAxisUnit: "", yAxisLabel: "", yAxisUnit: "", xMin: 0, xMax: 1, yMin: 0, yMax: 1,
    points: [], series: [], labels: [], values: [], components: [], annotations: [], tableColumns: [], tableRows: [], tableCells: [], hiddenCells: [], vectors: [],
  };
}

test("يبني بطاقات الدروس تلقائيًا من الأهداف ومراجع الكتاب والدليل", () => {
  const plan = [
    planItem("p1", "عزم القوة", "ref-1", "يحسب عزم القوة"),
    planItem("p2", "الاتزان", "ref-2", "يفسر شروط الاتزان", "تطبيق"),
  ];
  const cards = buildLessonCardsV2(plan, references());
  assert.equal(cards.length, 2);
  assert.equal(cards[0].lessonLabel, "عزم القوة");
  assert.deepEqual(cards[0].learningOutcomes, ["يحسب عزم القوة"]);
  assert.match(cards[0].sourceSummary, /المسافة العمودية/);
  assert.ok(cards[0].concepts.length > 0);
});

test("يبني طلب محرك V2 للاختبار كاملًا مع المخطط وبطاقات الدروس", () => {
  const plan = [
    planItem("p1", "عزم القوة", "ref-1", "يحسب عزم القوة"),
    planItem("p2", "الاتزان", "ref-2", "يفسر شروط الاتزان", "تطبيق"),
  ];
  const request = buildWholeExamGenerationRequestV2(
    "اختبار قصير رسمي", "عزم القوة والاتزان", ["عزم القوة", "الاتزان"], 10, "العلوم", "متوسط",
    references(), plan, [], true,
  );
  assert.equal(request.action, "generate_exam_v2");
  assert.equal(request.generationMode, "whole_exam_v2");
  assert.equal(request.generationVersion, ASSESSMENT_GENERATION_V2_VERSION);
  assert.equal(request.items.length, 2);
  assert.equal(request.lessonCards.length, 2);
  assert.equal(request.blueprint.itemCount, 2);
  assert.equal(request.blueprint.totalMarks, 2);
  assert.ok(request.blueprint.globalReviewRules.some((rule) => rule.includes("قابلية حل")));
});

test("يقرأ سؤالًا نهائيًا واحدًا لكل مفردة ويطبقه على الخطة", () => {
  const plan = [
    planItem("p1", "عزم القوة", "ref-1", "يحدد وحدة عزم القوة"),
    planItem("p2", "الاتزان", "ref-2", "يحدد معنى الاتزان"),
  ];
  const request = buildWholeExamGenerationRequestV2(
    "اختبار قصير رسمي", "عزم القوة والاتزان", ["عزم القوة", "الاتزان"], 10, "العلوم", "متوسط",
    references(), plan, [], true,
  );
  const payload = {
    items: request.items.map((item, index) => ({
      planItemId: item.planItemId,
      visual: { ...noVisual(), type: item.visualTarget },
      alternatives: [{
        stimulus: index === 0 ? "يدفع طالب بابًا من المقبض البعيد عن المفصلات." : "تقف أرجوحة متوازنة دون دوران.",
        text: index === 0 ? "ما وحدة قياس عزم القوة؟" : "أي عبارة تصف حالة الاتزان؟",
        options: index === 0 ? ["N m", "N/m", "kg", "Pa"] : ["محصلة القوى تساوي صفرًا", "القوة تزداد دائمًا", "الجسم يسرع", "العزم في اتجاه واحد"],
        answer: index === 0 ? "N m" : "محصلة القوى تساوي صفرًا",
        rationale: "الإجابة متوافقة مع المفهوم العلمي المطلوب.",
        markScheme: ["اختيار الإجابة العلمية الصحيحة."],
        questionForm: item.styleTarget,
        workingRequired: false,
        sourceSupport: index === 0 ? "العزم يقاس بالنيوتن متر." : "الاتزان يعني انعدام المحصلة.",
        enrichmentSupport: "", enrichmentSourceTitle: "", enrichmentSourceUrl: "", needsReview: false,
      }],
    })),
    model: "gemini-test-v2", generatedAt: "2026-08-01T08:00:00.000Z", requestId: "WQ-V2TEST",
  };
  const response = parseWholeExamGenerationResponseV2(payload, request.items);
  const applied = applyWholeExamQuestionsV2(plan, response);
  assert.equal(applied[0].proposals.length, 1);
  assert.equal(applied[0].proposals[0].id, "p1-v2-primary");
  assert.equal(response.requestId, "WQ-V2TEST");
});

test("يرفض إعادة مجموعة البيانات نفسها في سؤالين داخل الاختبار الكامل", () => {
  const plan = [
    planItem("p1", "عزم القوة", "ref-1", "يحسب عزم القوة"),
    planItem("p2", "الاتزان", "ref-2", "يفسر شروط الاتزان"),
  ];
  const request = buildWholeExamGenerationRequestV2(
    "اختبار قصير رسمي", "عزم القوة والاتزان", ["عزم القوة", "الاتزان"], 10, "العلوم", "متوسط",
    references(), plan, [], true,
  );
  const payload = {
    items: request.items.map((item, index) => ({
      planItemId: item.planItemId, visual: { ...noVisual(), type: item.visualTarget }, alternatives: [{
        stimulus: index === 0
          ? "سجل طالب القيم 2 و4 و6 عند قياس استطالة نابض."
          : "قاس طالب القيم 2 و4 و6 عند دفع حقيبة بعجلات.",
        text: index === 0
          ? "استنتج نمط تغير استطالة النابض من البيانات."
          : "فسر العلاقة بين قوة الدفع وحركة الحقيبة اعتمادًا على البيانات.",
        options: ["أ", "ب", "ج", "د"], answer: "أ", rationale: "صحيح.", markScheme: ["اختيار أ."],
        questionForm: item.styleTarget, workingRequired: false, sourceSupport: "دليل علمي.", needsReview: false,
      }],
    })),
  };
  assert.throws(() => parseWholeExamGenerationResponseV2(payload, request.items), /مجموعة البيانات العددية/);
});

test("يثبت مخطط V2 عدد المفردات والدرجات دون تغيير الخطة الرسمية", () => {
  const generatedItems = [
    { planItemId: "a", lessonLabel: "درس 1", outcomeLabel: "هدف 1", questionType: "اختيار من متعدد", cognitiveLevel: "معرفة", marks: 1, sourceReferenceId: "r1", styleTarget: "مفهومي", visualTarget: "none", scenarioTarget: "scientific_abstract", stimulusTarget: "concise_text", skillTarget: "recognize", diversityKey: "a" },
    { planItemId: "b", lessonLabel: "درس 2", outcomeLabel: "هدف 2", questionType: "إجابة قصيرة", cognitiveLevel: "تطبيق", marks: 2, sourceReferenceId: "r2", styleTarget: "سياقي", visualTarget: "context_scene", scenarioTarget: "door_handle", stimulusTarget: "real_life_scene", skillTarget: "apply", diversityKey: "b" },
  ];
  const blueprint = buildAssessmentBlueprintV2(generatedItems);
  assert.equal(blueprint.itemCount, 2);
  assert.equal(blueprint.totalMarks, 3);
  assert.deepEqual(blueprint.lessons, ["درس 1", "درس 2"]);
});

test("يطبع محرك V2 تعليمات خطوات الحل تلقائيًا للسؤال الحسابي متعدد الدرجات", () => {
  const expected = [{
    planItemId: "v2-calc-2", questionType: "إجابة قصيرة", cognitiveLevel: "تطبيق", marks: 2,
    sourceReferenceId: "ref-1", lessonLabel: "عزم القوة", outcomeLabel: "يحسب عزم القوة",
    styleTarget: "حسابي", visualTarget: "none", scenarioTarget: "wrench_tool",
    stimulusTarget: "real_life_scene", skillTarget: "calculate", diversityKey: "v2-calc-2",
  }];
  const payload = {
    items: [{
      planItemId: "v2-calc-2", visual: noVisual(), alternatives: [{
        stimulus: "يستخدم فني مفتاح ربط ويؤثر بقوة 20 N على بعد عمودي 0.30 m من محور الدوران.",
        text: "احسب عزم القوة.", options: [], answer: "6 N m",
        rationale: "العزم يساوي القوة مضروبة في البعد العمودي.",
        markScheme: ["استخدام علاقة العزم.", "التعويض وإيجاد 6 N m."],
        questionForm: "حسابي", workingRequired: false, sourceSupport: "يعتمد العزم على القوة والبعد العمودي.",
        enrichmentSupport: "", enrichmentSourceTitle: "", enrichmentSourceUrl: "", needsReview: false,
      }],
    }], model: "gemini-test-v2", generatedAt: "2026-08-01T10:00:00.000Z", requestId: "WQ-V2-CALC-2",
  };
  const response = parseWholeExamGenerationResponseV2(payload, expected);
  assert.equal(response.items[0].alternatives[0].workingRequired, true);
});

test("لا يضيف محرك V2 تعليمات خطوات الحل للسؤال الحسابي ذي الدرجة الواحدة", () => {
  const expected = [{
    planItemId: "v2-calc-1", questionType: "إجابة قصيرة", cognitiveLevel: "تطبيق", marks: 1,
    sourceReferenceId: "ref-1", lessonLabel: "عزم القوة", outcomeLabel: "يحسب عزم القوة",
    styleTarget: "حسابي", visualTarget: "none", scenarioTarget: "wrench_tool",
    stimulusTarget: "real_life_scene", skillTarget: "calculate", diversityKey: "v2-calc-1",
  }];
  const payload = {
    items: [{
      planItemId: "v2-calc-1", visual: noVisual(), alternatives: [{
        stimulus: "يؤثر طالب بقوة 5 N على بعد عمودي 2 m من محور الدوران.",
        text: "احسب عزم القوة.", options: [], answer: "10 N m",
        rationale: "العزم يساوي القوة مضروبة في البعد العمودي.",
        markScheme: ["حساب 10 N m."], questionForm: "حسابي", workingRequired: true,
        sourceSupport: "يعتمد العزم على القوة والبعد العمودي.", enrichmentSupport: "",
        enrichmentSourceTitle: "", enrichmentSourceUrl: "", needsReview: false,
      }],
    }], model: "gemini-test-v2", generatedAt: "2026-08-01T10:00:00.000Z", requestId: "WQ-V2-CALC-1",
  };
  const response = parseWholeExamGenerationResponseV2(payload, expected);
  assert.equal(response.items[0].alternatives[0].workingRequired, false);
});
