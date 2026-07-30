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

function requestItems() {
  return [{
    planItemId: "plan-1",
    questionType: "اختيار من متعدد",
    cognitiveLevel: "معرفة",
    marks: 1,
    sourceReferenceId: "ref-1",
    lessonLabel: "1-1 الشحنة الكهربائية",
  }];
}

function validPayload() {
  return {
    items: [{
      planItemId: "plan-1",
      alternatives: [1, 2, 3].map((index) => ({
        text: `ما العبارة الصحيحة عن الشحنة الكهربائية؟ ${index}`,
        options: ["خاصية فيزيائية", "وحدة زمن", "نوع طاقة حرارية", "قوة مغناطيسية فقط"],
        answer: "خاصية فيزيائية",
        rationale: "النص يعرّف الشحنة بوصفها خاصية فيزيائية.",
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
  assert.equal(generated[0].proposals[0].options.length, 4);
  assert.equal(generated[0].proposals[0].answer, "خاصية فيزيائية");
  assert.equal(SOURCE_GENERATION_VERSION, "source-grounded-policy-ai-5-gemini-response");
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
