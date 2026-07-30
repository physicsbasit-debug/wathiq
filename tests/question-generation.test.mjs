import test from "node:test";
import assert from "node:assert/strict";
import {
  applyGeneratedQuestions,
  buildQuestionGenerationRequest,
  GENERATION_BATCH_SIZE,
  parseQuestionGenerationResponse,
  QuestionGenerationService,
  SOURCE_GENERATION_VERSION,
  splitQuestionGenerationBatches,
} from "../dist/assets/question-generation.js";


function noVisual() {
  return {
    type: "none", title: "", altText: "", xAxisLabel: "", xAxisUnit: "",
    yAxisLabel: "", yAxisUnit: "", xMin: 0, xMax: 1, yMin: 0, yMax: 1,
    points: [], labels: [], values: [], components: [], annotations: [],
  };
}

function requestItems() {
  return [{
    planItemId: "plan-1",
    questionType: "اختيار من متعدد",
    cognitiveLevel: "معرفة",
    marks: 1,
    sourceReferenceId: "ref-1",
    lessonLabel: "1-1 الشحنة الكهربائية",
    styleTarget: "مفهومي",
    visualTarget: "none",
  }];
}

function validPayload() {
  return {
    items: [{
      planItemId: "plan-1",
      visual: noVisual(),
      alternatives: [1, 2, 3].map((index) => ({
        stimulus: "",
        text: `ما العبارة الصحيحة عن الشحنة الكهربائية؟ ${index}`,
        options: ["خاصية فيزيائية", "وحدة زمن", "نوع طاقة حرارية", "قوة مغناطيسية فقط"],
        answer: "خاصية فيزيائية",
        rationale: "النص يعرّف الشحنة بوصفها خاصية فيزيائية.",
        markScheme: ["تحديد العبارة العلمية الصحيحة."],
        questionForm: "مفهومي",
        workingRequired: false,
        sourceSupport: "الشحنة الكهربائية خاصية فيزيائية للمادة",
        needsReview: false,
      })),
    }],
    model: "gemini-test",
    generatedAt: "2026-07-29T19:00:00.000Z",
    requestId: "WQ-TEST1234",
  };
}

function planItem(id, lessonLabel, sourceReferenceId) {
  return {
    id,
    lessonId: `lesson-${id}`,
    lessonLabel,
    outcomeId: `outcome-${id}`,
    outcomeLabel: `فهم ${lessonLabel}`,
    cognitiveLevel: "معرفة",
    questionType: "اختيار من متعدد",
    marks: 1,
    sourceReferenceId,
    proposals: [],
  };
}

test("يبني طلب الدفعة من سياق المقطع الكامل ومن قائمة الدروس والخطة الرسمية", () => {
  const requestedPlan = [planItem("plan-1", "1-1 الشحنة الكهربائية", "ref-1")];
  const officialPlan = [
    ...requestedPlan,
    planItem("plan-2", "1-2 التأثيرات الكهربائية", "ref-2"),
  ];
  const request = buildQuestionGenerationRequest(
    "اختبار قصير رسمي",
    "1-1 الشحنة الكهربائية، 1-2 التأثيرات الكهربائية",
    ["1-1 الشحنة الكهربائية", "1-2 التأثيرات الكهربائية"],
    10,
    "الفيزياء",
    "متوسط",
    [
      {
        id: "ref-1",
        sourceId: "source-1",
        sourceTitle: "كتاب الطالب",
        sourceKind: "كتاب الطالب",
        pageFrom: 17,
        pageTo: 17,
        excerpt: "معاينة قصيرة",
        context: "الشحنة الكهربائية خاصية فيزيائية للمادة وقد تكون موجبة أو سالبة.",
        lessonTopic: "1-1 الشحنة الكهربائية",
        score: 95,
      },
      {
        id: "ref-2",
        sourceId: "source-1",
        sourceTitle: "كتاب الطالب",
        sourceKind: "كتاب الطالب",
        pageFrom: 18,
        pageTo: 18,
        excerpt: "تأثيرات كهربائية",
        context: "تتجاذب الشحنات المختلفة وتتنافر الشحنات المتشابهة.",
        lessonTopic: "1-2 التأثيرات الكهربائية",
        score: 90,
      },
    ],
    requestedPlan,
    officialPlan,
  );
  assert.deepEqual(request.lessons, ["1-1 الشحنة الكهربائية", "1-2 التأثيرات الكهربائية"]);
  assert.equal(request.references.length, 1);
  assert.equal(request.references[0].content, "الشحنة الكهربائية خاصية فيزيائية للمادة وقد تكون موجبة أو سالبة.");
  assert.equal(request.items[0].sourceReferenceId, "ref-1");
  assert.equal(request.items[0].lessonLabel, "1-1 الشحنة الكهربائية");
  assert.equal(request.items[0].styleTarget, "مفهومي");
  assert.equal(request.items[0].visualTarget, "none");
  assert.equal(request.officialPlanItems.length, 2);
  assert.equal(request.assessmentType, "اختبار قصير رسمي");
  assert.equal(request.assessmentPolicyId, "oman-science-assessment-2025-2026");
});

test("يقسم مفردات التوليد إلى دفعات صغيرة تحفظ ترتيبها", () => {
  const batches = splitQuestionGenerationBatches([1, 2, 3, 4, 5]);
  assert.equal(GENERATION_BATCH_SIZE, 2);
  assert.deepEqual(batches, [[1, 2], [3, 4], [5]]);
  assert.throws(() => splitQuestionGenerationBatches([1], 0), /حجم دفعة/);
});

test("يتحقق من ثلاثة بدائل ثم يربطها بخطة الاختبار", () => {
  const parsed = parseQuestionGenerationResponse(validPayload(), requestItems());
  const plan = [planItem("plan-1", "1-1 الشحنة الكهربائية", "ref-1")];
  const generated = applyGeneratedQuestions(plan, parsed);
  assert.equal(generated[0].proposals.length, 3);
  assert.equal(generated[0].visual.type, "none");
  assert.equal(generated[0].proposals[0].options.length, 4);
  assert.equal(generated[0].proposals[0].answer, "خاصية فيزيائية");
  assert.equal(generated[0].proposals[0].questionForm, "مفهومي");
  assert.deepEqual(generated[0].proposals[0].markScheme, ["تحديد العبارة العلمية الصحيحة."]);
  assert.equal(SOURCE_GENERATION_VERSION, "source-grounded-policy-ai-10-strict-lesson-scope");
  assert.equal(parsed.requestId, "WQ-TEST1234");
});

test("يرفض سؤال اختيار من متعدد لا تطابق إجابته أحد البدائل", () => {
  const payload = validPayload();
  payload.items[0].alternatives[0].answer = "إجابة غير موجودة";
  assert.throws(
    () => parseQuestionGenerationResponse(payload, requestItems()),
    /لا تطابق أحد بدائل/,
  );
});

test("يرسل جلسة المالك والدرس والخطة الرسمية إلى Edge Function ويقرأ النتيجة", async () => {
  let capturedUrl = "";
  let capturedInit;
  const service = new QuestionGenerationService(
    {
      supabaseUrl: "https://project.supabase.co",
      supabasePublishableKey: "publishable-key",
      googleOAuthClientId: "",
    },
    async () => ({
      accessToken: "owner-token",
      refreshToken: "refresh",
      expiresAt: Date.now() + 60_000,
      userId: "owner",
      email: "owner@example.com",
    }),
    async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify(validPayload()), { status: 200 });
    },
  );
  const items = requestItems();
  const response = await service.generate({
    assessmentType: "اختبار قصير رسمي",
    assessmentPolicyId: "oman-science-assessment-2025-2026",
    topic: "1-1 الشحنة الكهربائية، 1-2 التأثيرات الكهربائية",
    lessons: ["1-1 الشحنة الكهربائية", "1-2 التأثيرات الكهربائية"],
    grade: 10,
    subject: "الفيزياء",
    difficulty: "متوسط",
    references: [{
      id: "ref-1",
      sourceTitle: "كتاب الطالب",
      sourceKind: "كتاب الطالب",
      pageFrom: 17,
      pageTo: 17,
      content: "الشحنة الكهربائية خاصية فيزيائية للمادة",
    }],
    officialPlanItems: items,
    items,
  });
  assert.equal(capturedUrl, "https://project.supabase.co/functions/v1/generate-source-questions");
  assert.equal(capturedInit.headers.apikey, "publishable-key");
  assert.equal(capturedInit.headers.Authorization, "Bearer owner-token");
  const sent = JSON.parse(capturedInit.body);
  assert.deepEqual(sent.lessons, ["1-1 الشحنة الكهربائية", "1-2 التأثيرات الكهربائية"]);
  assert.equal(sent.officialPlanItems[0].lessonLabel, "1-1 الشحنة الكهربائية");
  assert.equal(response.items[0].alternatives.length, 3);
});


test("يعرض رمز تتبع Edge Function عند فشل دفعة التوليد", async () => {
  const service = new QuestionGenerationService(
    {
      supabaseUrl: "https://project.supabase.co",
      supabasePublishableKey: "publishable-key",
      googleOAuthClientId: "",
    },
    async () => ({
      accessToken: "owner-token",
      refreshToken: "refresh",
      expiresAt: Date.now() + 60_000,
      userId: "owner",
      email: "owner@example.com",
    }),
    async () => new Response(JSON.stringify({
      error: "أعاد مولد الأسئلة JSON غير صالح أو مبتور.",
      requestId: "WQ-A1B2C3D4",
    }), { status: 502 }),
  );
  const items = requestItems();
  await assert.rejects(
    () => service.generate({
      assessmentType: "اختبار قصير رسمي",
      assessmentPolicyId: "oman-science-assessment-2025-2026",
      topic: "1-1 الشحنة الكهربائية، 1-2 التأثيرات الكهربائية",
      lessons: ["1-1 الشحنة الكهربائية", "1-2 التأثيرات الكهربائية"],
      grade: 10,
      subject: "الفيزياء",
      difficulty: "متوسط",
      references: [{
        id: "ref-1",
        sourceTitle: "كتاب الطالب",
        sourceKind: "كتاب الطالب",
        pageFrom: 17,
        pageTo: 17,
        content: "الشحنة الكهربائية خاصية فيزيائية للمادة",
      }],
      officialPlanItems: items,
      items,
    }),
    /WQ-A1B2C3D4/,
  );
});

test("يوزع مفردات الفيزياء على أنماط بناء متنوعة لا على أسئلة مباشرة فقط", () => {
  const base = {
    lessonId: "lesson-style",
    lessonLabel: "1-1 الضغط",
    outcomeId: "outcome-style",
    outcomeLabel: "فهم الضغط",
    sourceReferenceId: "ref-style",
    proposals: [],
  };
  const officialPlan = [
    { ...base, id: "s-1", cognitiveLevel: "معرفة", questionType: "اختيار من متعدد", marks: 1 },
    { ...base, id: "s-2", cognitiveLevel: "تطبيق", questionType: "اختيار من متعدد", marks: 1 },
    { ...base, id: "s-3", cognitiveLevel: "معرفة", questionType: "إجابة قصيرة", marks: 2 },
    { ...base, id: "s-4", cognitiveLevel: "معرفة", questionType: "إجابة قصيرة", marks: 1 },
    { ...base, id: "s-5", cognitiveLevel: "استدلال", questionType: "إجابة قصيرة", marks: 2 },
    { ...base, id: "s-6", cognitiveLevel: "تطبيق", questionType: "إجابة طويلة", marks: 3 },
  ];
  const request = buildQuestionGenerationRequest(
    "اختبار قصير رسمي",
    "الضغط، الضغط في السوائل",
    ["1-1 الضغط", "1-2 الضغط في السوائل"],
    10,
    "الفيزياء",
    "متوسط",
    [{
      id: "ref-style",
      sourceId: "source-style",
      sourceTitle: "كتاب الطالب",
      sourceKind: "كتاب الطالب",
      pageFrom: 80,
      pageTo: 83,
      excerpt: "الضغط والقوة والمساحة والضغط في السوائل.",
      context: "الضغط هو القوة العمودية المؤثرة على وحدة المساحة، وتوجد تطبيقات حسابية وبيانية وتجريبية.",
      lessonTopic: "1-1 الضغط",
      score: 95,
    }],
    officialPlan,
    officialPlan,
  );
  assert.deepEqual(request.items.map((item) => item.styleTarget), [
    "مفهومي", "بيانات", "مقارنة", "مفهومي", "بيانات", "حسابي",
  ]);
});


test("يختار رسومًا منظمة للأسئلة البيانية والضغط والدوائر", () => {
  const base = {
    lessonId: "lesson-visual", outcomeId: "outcome-visual", outcomeLabel: "تطبيق المفهوم",
    proposals: [], questionType: "إجابة قصيرة", marks: 2, cognitiveLevel: "تطبيق",
  };
  const cases = [
    { id: "v1", lessonLabel: "الضغط في السوائل", sourceReferenceId: "r1" },
    { id: "v2", lessonLabel: "الدوائر الكهربائية", sourceReferenceId: "r2" },
    { id: "v3", lessonLabel: "قراءة البيانات", sourceReferenceId: "r3", cognitiveLevel: "استدلال" },
  ].map((item) => ({ ...base, ...item }));
  const refs = [
    { id: "r1", sourceId: "s", sourceTitle: "كتاب", sourceKind: "كتاب الطالب", pageFrom: 1, pageTo: 1, excerpt: "يتغير الضغط في السائل مع العمق.", score: 90 },
    { id: "r2", sourceId: "s", sourceTitle: "كتاب", sourceKind: "كتاب الطالب", pageFrom: 2, pageTo: 2, excerpt: "تتكون الدائرة من بطارية ومصباح ومقاومة.", score: 90 },
    { id: "r3", sourceId: "s", sourceTitle: "كتاب", sourceKind: "كتاب الطالب", pageFrom: 3, pageTo: 3, excerpt: "تعرض النتائج في رسم بياني.", score: 90 },
  ];
  const request = buildQuestionGenerationRequest("اختبار قصير رسمي", "موضوعان", ["الضغط في السوائل", "الدوائر الكهربائية"], 10, "الفيزياء", "متوسط", refs, cases.slice(0, 2), cases.slice(0, 2));
  assert.deepEqual(request.items.map((item) => item.visualTarget), ["pressure_diagram", "circuit_diagram"]);
});

test("يفصل المفردات الثقيلة أو البصرية في دفعات مستقلة", () => {
  const items = [
    { id: 1, marks: 1, visualTarget: "none" },
    { id: 2, marks: 1, visualTarget: "none" },
    { id: 3, marks: 1, visualTarget: "line_graph" },
    { id: 4, marks: 2, visualTarget: "none" },
  ];
  assert.deepEqual(splitQuestionGenerationBatches(items).map((batch) => batch.map((item) => item.id)), [[1, 2], [3], [4]]);
});


test("يفصل مفردات التطبيق البصرية المحتملة في طلبات مستقلة", () => {
  const items = [
    { id: 1, questionType: "اختيار من متعدد", cognitiveLevel: "معرفة", marks: 1 },
    { id: 2, questionType: "اختيار من متعدد", cognitiveLevel: "تطبيق", marks: 1 },
    { id: 3, questionType: "اختيار من متعدد", cognitiveLevel: "معرفة", marks: 1 },
  ];
  assert.deepEqual(splitQuestionGenerationBatches(items).map((batch) => batch.map((item) => item.id)), [[1], [2], [3]]);
});


test("لا يفرض رسم ضغط أو دائرة على درس النشاط الإشعاعي", () => {
  const item = {
    id: "rad-1", lessonId: "l", lessonLabel: "9-1 النشاط الإشعاعي في كل مكان", outcomeId: "o", outcomeLabel: "فهم النشاط الإشعاعي",
    proposals: [], questionType: "إجابة قصيرة", marks: 2, cognitiveLevel: "استدلال", sourceReferenceId: "r-rad",
  };
  const refs = [{ id: "r-rad", sourceId: "s", sourceTitle: "كتاب", sourceKind: "كتاب الطالب", pageFrom: 12, pageTo: 12, excerpt: "النشاط الإشعاعي انبعاث تلقائي من نوى غير مستقرة.", context: "النشاط الإشعاعي انبعاث تلقائي من نوى غير مستقرة، وتوجد إشعاعات ألفا وبيتا وجاما.", score: 95 }];
  const request = buildQuestionGenerationRequest("اختبار قصير رسمي", "النشاط الإشعاعي", ["9-1 النشاط الإشعاعي في كل مكان", "9-2 أنواع الإشعاع"], 10, "الفيزياء", "متوسط", refs, [item], [item]);
  assert.equal(request.items[0].visualTarget, "none");
});
