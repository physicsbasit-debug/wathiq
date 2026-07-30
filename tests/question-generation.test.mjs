import test from "node:test";
import assert from "node:assert/strict";
import {
  applyGeneratedQuestions,
  buildQuestionGenerationRequest,
  parseQuestionGenerationResponse,
  QuestionGenerationService,
  SOURCE_GENERATION_VERSION,
} from "../dist/assets/question-generation.js";

function requestItems() {
  return [{
    planItemId: "plan-1",
    questionType: "اختيار من متعدد",
    cognitiveLevel: "معرفة",
    marks: 1,
    sourceReferenceId: "ref-1",
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
    model: "gpt-test",
    generatedAt: "2026-07-29T19:00:00.000Z",
  };
}

test("يبني طلب التوليد من سياق المقطع الكامل لا من المعاينة المختصرة", () => {
  const plan = [{
    id: "plan-1",
    lessonId: "topic-1",
    lessonLabel: "الشحنة الكهربائية",
    outcomeId: "outcome-1",
    outcomeLabel: "فهم الشحنة",
    cognitiveLevel: "معرفة",
    questionType: "اختيار من متعدد",
    marks: 1,
    sourceReferenceId: "ref-1",
    proposals: [],
  }];
  const request = buildQuestionGenerationRequest(
    "الشحنة الكهربائية",
    10,
    "الفيزياء",
    "متوسط",
    [{
      id: "ref-1",
      sourceId: "source-1",
      sourceTitle: "كتاب الطالب",
      sourceKind: "كتاب الطالب",
      pageFrom: 17,
      pageTo: 17,
      excerpt: "معاينة قصيرة",
      context: "الشحنة الكهربائية خاصية فيزيائية للمادة وقد تكون موجبة أو سالبة.",
      score: 95,
    }],
    plan,
  );
  assert.equal(request.references.length, 1);
  assert.equal(request.references[0].content, "الشحنة الكهربائية خاصية فيزيائية للمادة وقد تكون موجبة أو سالبة.");
  assert.equal(request.items[0].sourceReferenceId, "ref-1");
  assert.equal(request.assessmentType, "اختبار قصير رسمي");
  assert.equal(request.assessmentPolicyId, "oman-science-assessment-2025-2026");
});

test("يتحقق من ثلاثة بدائل ثم يربطها بخطة الاختبار", () => {
  const parsed = parseQuestionGenerationResponse(validPayload(), requestItems());
  const plan = [{
    id: "plan-1",
    lessonId: "topic-1",
    lessonLabel: "الشحنة الكهربائية",
    outcomeId: "outcome-1",
    outcomeLabel: "فهم الشحنة",
    cognitiveLevel: "معرفة",
    questionType: "اختيار من متعدد",
    marks: 1,
    sourceReferenceId: "ref-1",
    proposals: [],
  }];
  const generated = applyGeneratedQuestions(plan, parsed);
  assert.equal(generated[0].proposals.length, 3);
  assert.equal(generated[0].proposals[0].options.length, 4);
  assert.equal(generated[0].proposals[0].answer, "خاصية فيزيائية");
  assert.equal(SOURCE_GENERATION_VERSION, "source-grounded-policy-ai-2");
});

test("يرفض سؤال اختيار من متعدد لا تطابق إجابته أحد البدائل", () => {
  const payload = validPayload();
  payload.items[0].alternatives[0].answer = "إجابة غير موجودة";
  assert.throws(
    () => parseQuestionGenerationResponse(payload, requestItems()),
    /لا تطابق أحد بدائل/,
  );
});

test("يرسل جلسة المالك إلى Edge Function ويقرأ النتيجة المنظمة", async () => {
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
  const response = await service.generate({
    assessmentType: "اختبار قصير رسمي",
    assessmentPolicyId: "oman-science-assessment-2025-2026",
    topic: "الشحنة الكهربائية",
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
    items: requestItems(),
  });
  assert.equal(capturedUrl, "https://project.supabase.co/functions/v1/generate-source-questions");
  assert.equal(capturedInit.headers.apikey, "publishable-key");
  assert.equal(capturedInit.headers.Authorization, "Bearer owner-token");
  assert.equal(response.items[0].alternatives.length, 3);
});
