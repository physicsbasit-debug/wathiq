import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = requiredEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const GEMINI_API_KEY = requiredEnv("GEMINI_API_KEY");
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL")?.trim() || "gemini-2.5-flash";
const WATHIQ_APP_URL = requiredEnv("WATHIQ_APP_URL");
const appOrigin = new URL(WATHIQ_APP_URL).origin;
const MAX_BATCH_ITEMS = 2;
const MAX_OFFICIAL_ITEMS = 40;
const MAX_REFERENCES = 6;
const MAX_REFERENCE_CHARACTERS = 4_200;
const MAX_TOTAL_REFERENCE_CHARACTERS = 24_000;
const GEMINI_TIMEOUT_MS = 30_000;
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1/interactions";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type QuestionType = "اختيار من متعدد" | "إجابة قصيرة" | "إجابة طويلة";
type CognitiveLevel = "معرفة" | "تطبيق" | "استدلال";
type Difficulty = "سهل" | "متوسط" | "متقدم";
type ItemDifficulty = "منخفض" | "متوسط" | "مرتفع";
type AssessmentType = "اختبار قصير رسمي" | "امتحان نهاية الفصل الدراسي";

interface GenerationReference {
  id: string;
  sourceTitle: string;
  sourceKind: string;
  pageFrom: number;
  pageTo: number;
  content: string;
}

interface GenerationItem {
  planItemId: string;
  questionType: QuestionType;
  cognitiveLevel: CognitiveLevel;
  difficultyLevel?: ItemDifficulty;
  marks: number;
  sourceReferenceId: string;
  lessonLabel: string;
}

interface GenerationRequest {
  assessmentType: AssessmentType;
  assessmentPolicyId: "oman-science-assessment-2025-2026";
  topic: string;
  lessons: string[];
  grade: number;
  subject: string;
  difficulty: Difficulty;
  references: GenerationReference[];
  officialPlanItems: GenerationItem[];
  items: GenerationItem[];
}

interface GeneratedAlternative {
  text: string;
  options: string[];
  answer: string;
  rationale: string;
  sourceSupport: string;
  needsReview: boolean;
}

interface GeneratedItem {
  planItemId: string;
  alternatives: GeneratedAlternative[];
}

interface GeneratedPayload {
  items: GeneratedItem[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const requestId = createRequestId();
  if (req.method !== "POST") return json(req, { error: "هذه الخدمة تقبل POST فقط.", requestId }, 405);

  logStage(requestId, "request_received");
  try {
    await requireUser(req);
    logStage(requestId, "authentication_passed");
    const request = parseGenerationRequest(await req.json());
    logStage(requestId, "payload_validated", {
      itemCount: request.items.length,
      referenceCount: request.references.length,
      lessonCount: request.lessons.length,
    });
    const generated = await generateAndValidate(request, requestId);
    logStage(requestId, "response_sent", { itemCount: generated.items.length });
    return json(req, {
      items: generated.items,
      model: GEMINI_MODEL,
      generatedAt: new Date().toISOString(),
      requestId,
    });
  } catch (error) {
    logStage(requestId, "request_failed", {
      status: errorStatus(error),
      message: errorMessage(error),
    });
    return json(req, { error: errorMessage(error), requestId }, errorStatus(error));
  }
});

async function generateAndValidate(request: GenerationRequest, requestId: string): Promise<GeneratedPayload> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const payload = await callGemini(request, attempt > 1, requestId, attempt);
      validateGeneratedPayload(payload, request);
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt === 2 || !isRetryableGenerationError(error)) break;
      await delay(700);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("تعذر إنشاء أسئلة صالحة من المصدر.");
}

async function callGemini(
  request: GenerationRequest,
  repairAttempt: boolean,
  requestId: string,
  attempt: number,
): Promise<GeneratedPayload> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  const startedAt = Date.now();
  logStage(requestId, "gemini_request_started", {
    attempt,
    repairAttempt,
    itemCount: request.items.length,
    referenceCount: request.references.length,
  });
  try {
    const response = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "x-goog-api-key": GEMINI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        input: buildUserPrompt(request, repairAttempt),
        system_instruction: buildSystemInstructions(),
        store: false,
        generation_config: {
          max_output_tokens: 7_000,
        },
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: generationSchema(request.items.length),
        },
      }),
      signal: controller.signal,
    });
    const payload = await response.json() as unknown;
    if (!response.ok) {
      const message = geminiError(payload, `تعذر الاتصال بمولد الأسئلة (${response.status}).`);
      logStage(requestId, "gemini_http_failed", {
        attempt,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      if (response.status >= 500 || response.status === 429) throw retryableError(message);
      throw httpError(message, 400);
    }
    assertCompletedGeminiInteraction(payload);
    const output = findGeminiOutputText(payload);
    logStage(requestId, "gemini_response_received", {
      attempt,
      interactionStatus: geminiInteractionStatus(payload),
      textPartCount: output.partCount,
      outputCharacters: output.text.length,
      durationMs: Date.now() - startedAt,
    });
    if (!output.text) {
      const stepError = geminiModelOutputError(payload);
      throw retryableError(stepError || "لم يُرجع مولد الأسئلة بيانات قابلة للقراءة.");
    }
    return parseGeneratedJson(output.text);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw retryableError("تأخر مولد الأسئلة أكثر من المدة المسموحة.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseGeneratedJson(outputText: string): GeneratedPayload {
  const original = outputText.replace(/^\uFEFF/, "").trim();
  const candidates = [original, stripMarkdownFence(original)];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as GeneratedPayload;
    } catch {
      // ننتقل إلى استخراج أول كائن JSON متوازن بدل قص النص عند آخر قوس عشوائي.
    }
  }

  const extracted = extractFirstJsonObject(stripMarkdownFence(original));
  if (!extracted) {
    if (original.includes("{")) throw retryableError("أعاد مولد الأسئلة JSON غير مكتمل.");
    throw retryableError("أعاد مولد الأسئلة JSON غير صالح أو مبتور.");
  }
  try {
    return JSON.parse(extracted) as GeneratedPayload;
  } catch {
    throw retryableError("أعاد مولد الأسئلة JSON غير صالح أو مبتور.");
  }
}

function stripMarkdownFence(value: string): string {
  const text = value.trim();
  if (!text.startsWith("```")) return text;
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}

function extractFirstJsonObject(value: string): string | null {
  const start = value.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return value.slice(start, index + 1);
      if (depth < 0) return null;
    }
  }
  return null;
}

function buildSystemInstructions(): string {
  return [
    "أنت محرر اختبارات علوم مدرسية باللغة العربية لسلطنة عُمان.",
    "التزم بوثيقة تقويم تعلم الطلبة في مواد العلوم للصفوف 5-10، إصدار 2025/2026.",
    "مهمتك إنشاء أسئلة من النصوص المرجعية المرفقة فقط، دون إضافة معلومة علمية من الذاكرة أو الإنترنت.",
    "أنشئ ثلاثة بدائل مختلفة لكل مفردة مرسلة في هذه الدفعة فقط، مع الحفاظ حرفيًا على الدرس ونوع السؤال وهدف التقويم ومستوى الصعوبة والدرجة.",
    "لا تخلط بين الدروس؛ كل مفردة مرتبطة باسم درس ومرجع صفحة محددين في الخطة.",
    "مفردة الاختيار من متعدد درجتها واحدة وتقيس هدفًا واحدًا، ولها أربعة بدائل وإجابة صحيحة واحدة فقط.",
    "اجعل مشتتات الاختيار من متعدد مقنعة ومرتبطة بالموضوع لكنها خاطئة تمامًا، ولا تستخدم: جميع ما سبق، لا شيء مما سبق، أو الأول والثاني فقط.",
    "الإجابة القصيرة درجتها درجة أو درجتان، ويجب أن يتناسب مقدار الإجابة مع الدرجة.",
    "الإجابة الطويلة للصفين 9 و10 فقط ودرجتها ثلاث أو أربع درجات، وتتطلب شرحًا أو تحليلًا أو أدلة أو خطوات حل، لا مجرد سرد أو استرجاع.",
    "استخدم صياغة عربية قصيرة وواضحة وفعل أمر مناسبًا، وتجنب النفي قدر الإمكان والنفي المزدوج.",
    "للإجابة القصيرة والطويلة: اجعل options مصفوفة فارغة، واكتب إجابة نموذجية قابلة للتصحيح.",
    "اجعل sourceSupport عبارة قصيرة منسوخة حرفيًا من نص المرجع وتدعم السؤال والإجابة.",
    "لا تسأل عن أرقام صفحات أو حقوق نشر أو مقدمة الكتاب إلا إذا كان الموضوع المطلوب عنها صراحة.",
    "إذا كان النص المرجعي ضعيفًا لمفردة معينة، أنشئ سؤالًا بسيطًا على حقيقة صريحة واضبط needsReview=true. لا تخترع.",
    "لا تستخدم عبارات مثل: بالرجوع إلى النص أو وفقًا للمصدر داخل نص السؤال.",
    "لا تضع شروحًا خارج مخطط JSON المطلوب.",
  ].join("\n");
}

function buildUserPrompt(request: GenerationRequest, repairAttempt: boolean): string {
  const references = request.references.map((reference) => ({
    id: reference.id,
    sourceTitle: reference.sourceTitle,
    sourceKind: reference.sourceKind,
    pages: reference.pageFrom === reference.pageTo ? `${reference.pageFrom}` : `${reference.pageFrom}-${reference.pageTo}`,
    content: reference.content,
  }));
  return JSON.stringify({
    task: repairAttempt
      ? "أعد التوليد بدقة أكبر. التزم بعدد البدائل وبالاستناد الحرفي إلى كل مرجع."
      : "أنشئ بدائل الأسئلة الموثقة من المراجع.",
    exam: {
      assessmentType: request.assessmentType,
      assessmentPolicyId: request.assessmentPolicyId,
      topic: request.topic,
      lessons: request.lessons,
      grade: request.grade,
      subject: request.subject,
      difficulty: request.difficulty,
    },
    references,
    officialPlanSummary: request.officialPlanItems.map((item) => ({
      planItemId: item.planItemId,
      lessonLabel: item.lessonLabel,
      questionType: item.questionType,
      cognitiveLevel: item.cognitiveLevel,
      difficultyLevel: item.difficultyLevel ?? null,
      marks: item.marks,
    })),
    batchPlanItems: request.items,
  });
}

function generationSchema(requestedItemCount: number): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      items: {
        type: "array",
        minItems: requestedItemCount,
        maxItems: requestedItemCount,
        items: {
          type: "object",
          properties: {
            planItemId: { type: "string" },
            alternatives: {
              type: "array",
              minItems: 3,
              maxItems: 3,
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  options: { type: "array", items: { type: "string" } },
                  answer: { type: "string" },
                  rationale: { type: "string" },
                  sourceSupport: { type: "string" },
                  needsReview: { type: "boolean" },
                },
                required: ["text", "options", "answer", "rationale", "sourceSupport", "needsReview"],
                additionalProperties: false,
              },
            },
          },
          required: ["planItemId", "alternatives"],
          additionalProperties: false,
        },
      },
    },
    required: ["items"],
    additionalProperties: false,
  };
}

function parseGenerationRequest(value: unknown): GenerationRequest {
  const record = requireRecord(value, "طلب إنشاء الأسئلة غير صالح.");
  const assessmentType = requireEnum(record.assessmentType, ["اختبار قصير رسمي", "امتحان نهاية الفصل الدراسي"] as const, "نوع التقويم غير صالح.");
  const assessmentPolicyId = requireEnum(record.assessmentPolicyId, ["oman-science-assessment-2025-2026"] as const, "مرجع التقويم غير صالح.");
  const topic = requireText(record.topic, "موضوع الاختبار غير موجود.", 500);
  const subject = requireText(record.subject, "اسم المادة غير موجود.", 120);
  const grade = requireInteger(record.grade, "الصف الدراسي غير صالح.", 1, 12);
  const difficulty = requireEnum(record.difficulty, ["سهل", "متوسط", "متقدم"] as const, "مستوى الصعوبة غير صالح.");
  if (!Array.isArray(record.lessons) || record.lessons.length < 2 || record.lessons.length > 5) {
    throw httpError("يجب إرسال درسين إلى خمسة دروس.", 400);
  }
  const lessons = record.lessons.map((lesson) => requireText(lesson, "اسم أحد الدروس غير موجود.", 180));
  const lessonKeys = lessons.map(normalizeForEvidence);
  if (new Set(lessonKeys).size !== lessons.length) throw httpError("توجد دروس مكررة في الطلب.", 400);

  if (!Array.isArray(record.references) || record.references.length < 1 || record.references.length > MAX_REFERENCES) {
    throw httpError(`يجب إرسال مرجع واحد إلى ${MAX_REFERENCES} مراجع للدفعة.`, 400);
  }
  if (!Array.isArray(record.items) || record.items.length < 1 || record.items.length > MAX_BATCH_ITEMS) {
    throw httpError(`يجب إرسال مفردة واحدة إلى ${MAX_BATCH_ITEMS} مفردتين في الدفعة.`, 400);
  }
  if (!Array.isArray(record.officialPlanItems) || record.officialPlanItems.length < 1 || record.officialPlanItems.length > MAX_OFFICIAL_ITEMS) {
    throw httpError(`خطة الاختبار الرسمية يجب أن تحتوي من مفردة واحدة إلى ${MAX_OFFICIAL_ITEMS} مفردة.`, 400);
  }

  let totalReferenceCharacters = 0;
  const references = record.references.map((entry) => {
    const item = requireRecord(entry, "أحد المراجع غير صالح.");
    const content = requireText(item.content, "نص أحد المراجع فارغ.", MAX_REFERENCE_CHARACTERS);
    totalReferenceCharacters += content.length;
    return {
      id: requireText(item.id, "معرف المرجع غير موجود.", 220),
      sourceTitle: requireText(item.sourceTitle, "عنوان المرجع غير موجود.", 220),
      sourceKind: requireText(item.sourceKind, "نوع المرجع غير موجود.", 100),
      pageFrom: requireInteger(item.pageFrom, "بداية صفحات المرجع غير صالحة.", 1, 10_000),
      pageTo: requireInteger(item.pageTo, "نهاية صفحات المرجع غير صالحة.", 1, 10_000),
      content,
    } satisfies GenerationReference;
  });
  if (totalReferenceCharacters > MAX_TOTAL_REFERENCE_CHARACTERS) {
    throw httpError("مجموع نصوص المراجع أكبر من الحد المسموح لدفعة توليد واحدة.", 413);
  }
  const referenceIds = new Set(references.map((reference) => reference.id));
  if (referenceIds.size !== references.length) throw httpError("توجد مراجع مكررة في الطلب.", 400);
  references.forEach((reference) => {
    if (reference.pageTo < reference.pageFrom) throw httpError("نطاق صفحات أحد المراجع غير صالح.", 400);
  });

  const parsePlanItem = (entry: unknown, requireSentReference: boolean): GenerationItem => {
    const item = requireRecord(entry, "إحدى مفردات الخطة غير صالحة.");
    const sourceReferenceId = requireText(item.sourceReferenceId, "مرجع إحدى المفردات غير موجود.", 220);
    if (requireSentReference && !referenceIds.has(sourceReferenceId)) {
      throw httpError("إحدى مفردات الدفعة تشير إلى مرجع غير مرسل.", 400);
    }
    const lessonLabel = requireText(item.lessonLabel, "درس إحدى المفردات غير موجود.", 180);
    if (!lessonKeys.includes(normalizeForEvidence(lessonLabel))) {
      throw httpError("إحدى مفردات الخطة مرتبطة بدرس غير موجود في قائمة الدروس.", 400);
    }
    return {
      planItemId: requireText(item.planItemId, "معرف مفردة الخطة غير موجود.", 120),
      questionType: requireEnum(item.questionType, ["اختيار من متعدد", "إجابة قصيرة", "إجابة طويلة"] as const, "نوع السؤال غير صالح."),
      cognitiveLevel: requireEnum(item.cognitiveLevel, ["معرفة", "تطبيق", "استدلال"] as const, "المستوى المعرفي غير صالح."),
      ...(item.difficultyLevel === undefined
        ? {}
        : { difficultyLevel: requireEnum(item.difficultyLevel, ["منخفض", "متوسط", "مرتفع"] as const, "مستوى صعوبة المفردة غير صالح.") }),
      marks: requireInteger(item.marks, "درجة السؤال غير صالحة.", 1, 20),
      sourceReferenceId,
      lessonLabel,
    };
  };

  const officialPlanItems = record.officialPlanItems.map((entry) => parsePlanItem(entry, false));
  const items = record.items.map((entry) => parsePlanItem(entry, true));
  if (new Set(officialPlanItems.map((item) => item.planItemId)).size !== officialPlanItems.length) {
    throw httpError("توجد مفردات مكررة في خطة الاختبار الرسمية.", 400);
  }
  if (new Set(items.map((item) => item.planItemId)).size !== items.length) {
    throw httpError("توجد مفردات مكررة في دفعة التوليد.", 400);
  }
  validateOfficialAssessmentPlan(assessmentType, grade, officialPlanItems);
  for (const lessonKey of lessonKeys) {
    if (!officialPlanItems.some((item) => normalizeForEvidence(item.lessonLabel) === lessonKey)) {
      throw httpError("خطة الاختبار لا توزع المفردات على جميع الدروس المدخلة.", 400);
    }
  }

  const officialById = new Map(officialPlanItems.map((item) => [item.planItemId, item]));
  for (const item of items) {
    const official = officialById.get(item.planItemId);
    if (!official
      || official.questionType !== item.questionType
      || official.cognitiveLevel !== item.cognitiveLevel
      || official.difficultyLevel !== item.difficultyLevel
      || official.marks !== item.marks
      || official.sourceReferenceId !== item.sourceReferenceId
      || normalizeForEvidence(official.lessonLabel) !== normalizeForEvidence(item.lessonLabel)) {
      throw httpError("دفعة التوليد لا تطابق خطة الاختبار الرسمية.", 400);
    }
  }
  return { assessmentType, assessmentPolicyId, topic, lessons, grade, subject, difficulty, references, officialPlanItems, items };
}

function validateOfficialAssessmentPlan(assessmentType: AssessmentType, grade: number, items: GenerationItem[]): void {
  if (grade < 5 || grade > 10) throw httpError("وثيقة تقويم العلوم الحالية تغطي الصفوف 5-10 فقط.", 400);
  const totalMarks = items.reduce((total, item) => total + item.marks, 0);
  const cognitiveMarks: Record<CognitiveLevel, number> = { معرفة: 0, تطبيق: 0, استدلال: 0 };
  const difficultyMarks: Record<ItemDifficulty, number> = { منخفض: 0, متوسط: 0, مرتفع: 0 };
  const counts = { mcq: 0, short: 0, long: 0 };
  for (const item of items) {
    cognitiveMarks[item.cognitiveLevel] += item.marks;
    if (item.difficultyLevel) difficultyMarks[item.difficultyLevel] += item.marks;
    if (item.questionType === "اختيار من متعدد") {
      counts.mcq += 1;
      if (item.marks !== 1) throw httpError("مفردة الاختيار من متعدد يجب أن تكون بدرجة واحدة.", 400);
    } else if (item.questionType === "إجابة قصيرة") {
      counts.short += 1;
      if (item.marks < 1 || item.marks > 2) throw httpError("مفردة الإجابة القصيرة يجب أن تكون بدرجة أو درجتين.", 400);
    } else {
      counts.long += 1;
      if (grade < 9 || item.marks < 3 || item.marks > 4) throw httpError("مفردة الإجابة الطويلة مسموحة للصفين 9 و10 وبثلاث أو أربع درجات.", 400);
    }
  }

  if (assessmentType === "اختبار قصير رسمي") {
    const expectedMarks = grade === 10 ? 10 : 15;
    const expectedCognitive = grade === 10
      ? { معرفة: 4, تطبيق: 4, استدلال: 2 }
      : { معرفة: 6, تطبيق: 6, استدلال: 3 };
    const minItems = grade === 10 ? 5 : 8;
    const maxItems = grade === 10 ? 7 : 12;
    if (items.length < minItems || items.length > maxItems || totalMarks !== expectedMarks) {
      throw httpError("خطة الاختبار القصير لا تطابق عدد المفردات أو الدرجة الكلية الرسمية.", 400);
    }
    if (cognitiveMarks.معرفة !== expectedCognitive.معرفة || cognitiveMarks.تطبيق !== expectedCognitive.تطبيق || cognitiveMarks.استدلال !== expectedCognitive.استدلال) {
      throw httpError("توزيع درجات المعرفة والتطبيق والاستدلال لا يطابق 40% و40% و20%.", 400);
    }
    if (grade <= 8 && (counts.mcq !== 3 || counts.short < 5 || counts.short > 9 || counts.long !== 0)) {
      throw httpError("أنواع مفردات الصفوف 5-8 لا تطابق وثيقة التقويم.", 400);
    }
    if (grade === 9 && (counts.mcq !== 3 || counts.long !== 1)) {
      throw httpError("أنواع مفردات الصف التاسع لا تطابق وثيقة التقويم.", 400);
    }
    if (grade === 10) {
      const mcqLevels = items.filter((item) => item.questionType === "اختيار من متعدد").map((item) => item.cognitiveLevel).sort();
      if (counts.mcq !== 2 || counts.long !== 1 || mcqLevels.join("|") !== ["تطبيق", "معرفة"].sort().join("|")) {
        throw httpError("اختبار الصف العاشر يحتاج مفردتي اختيار من متعدد للمعرفة والتطبيق ومفردة طويلة واحدة.", 400);
      }
    }
    return;
  }

  const expectedMarks = grade === 10 ? 60 : 40;
  const expectedCognitive = grade === 10
    ? { معرفة: 24, تطبيق: 24, استدلال: 12 }
    : { معرفة: 16, تطبيق: 16, استدلال: 8 };
  const expectedDifficulty = grade === 10
    ? { منخفض: 24, متوسط: 24, مرتفع: 12 }
    : { منخفض: 16, متوسط: 16, مرتفع: 8 };
  const minItems = grade === 10 ? 30 : 25;
  const maxItems = grade === 10 ? 40 : 35;
  const expectedMcq = grade === 10 ? 10 : 8;
  if (items.length < minItems || items.length > maxItems || totalMarks !== expectedMarks) {
    throw httpError("خطة الاختبار النهائي لا تطابق عدد المفردات أو الدرجة الكلية الرسمية.", 400);
  }
  if (cognitiveMarks.معرفة !== expectedCognitive.معرفة || cognitiveMarks.تطبيق !== expectedCognitive.تطبيق || cognitiveMarks.استدلال !== expectedCognitive.استدلال) {
    throw httpError("توزيع أهداف التقويم في الاختبار النهائي لا يطابق 40% و40% و20%.", 400);
  }
  if (difficultyMarks.منخفض !== expectedDifficulty.منخفض || difficultyMarks.متوسط !== expectedDifficulty.متوسط || difficultyMarks.مرتفع !== expectedDifficulty.مرتفع) {
    throw httpError("توزيع مستويات الصعوبة في الاختبار النهائي لا يطابق 40% و40% و20%.", 400);
  }
  if (counts.mcq !== expectedMcq) throw httpError("عدد مفردات الاختيار من متعدد في الاختبار النهائي غير مطابق.", 400);
  if (grade <= 8 && counts.long !== 0) throw httpError("الإجابة الطويلة غير مستخدمة في الاختبار النهائي للصفوف 5-8.", 400);
  if (grade >= 9 && counts.long < 2) throw httpError("الاختبار النهائي للصفين 9 و10 يحتاج مفردتين طويلتين على الأقل.", 400);
}

function validateGeneratedPayload(payload: GeneratedPayload, request: GenerationRequest): void {
  if (!payload || !Array.isArray(payload.items)) throw retryableError("بنية الأسئلة المولدة غير صالحة.");
  const requestedById = new Map(request.items.map((item) => [item.planItemId, item]));
  const referencesById = new Map(request.references.map((reference) => [reference.id, reference]));
  const seen = new Set<string>();

  for (const generatedItem of payload.items) {
    if (!generatedItem || typeof generatedItem.planItemId !== "string" || seen.has(generatedItem.planItemId)) {
      throw retryableError("مولد الأسئلة أعاد مفردة مجهولة أو مكررة.");
    }
    const requested = requestedById.get(generatedItem.planItemId);
    if (!requested || !Array.isArray(generatedItem.alternatives) || generatedItem.alternatives.length !== 3) {
      throw retryableError("مولد الأسئلة لم يلتزم بثلاثة بدائل لكل مفردة.");
    }
    const reference = referencesById.get(requested.sourceReferenceId);
    if (!reference) throw retryableError("تعذر التحقق من مرجع السؤال المولد.");
    seen.add(generatedItem.planItemId);

    for (const alternative of generatedItem.alternatives) {
      validateAlternative(alternative, requested.questionType, reference);
    }
  }
  if (seen.size !== requestedById.size) throw retryableError("مولد الأسئلة لم يُعد جميع مفردات الخطة.");
}

function validateAlternative(alternative: GeneratedAlternative, questionType: QuestionType, reference: GenerationReference): void {
  if (!alternative || typeof alternative !== "object") throw retryableError("أحد بدائل الأسئلة غير صالح.");
  for (const field of ["text", "answer", "rationale", "sourceSupport"] as const) {
    if (typeof alternative[field] !== "string" || !alternative[field].trim()) {
      throw retryableError("أحد بدائل الأسئلة يحتوي حقلًا نصيًا فارغًا.");
    }
  }
  if (!Array.isArray(alternative.options) || typeof alternative.needsReview !== "boolean") {
    throw retryableError("أحد بدائل الأسئلة لا يطابق البنية المطلوبة.");
  }
  if (questionType === "اختيار من متعدد") {
    const options = alternative.options.map((option) => typeof option === "string" ? option.trim() : "");
    if (options.some((option) => !option) || options.length !== 4 || new Set(options).size !== 4) {
      throw retryableError("سؤال اختيار من متعدد لا يحتوي أربعة بدائل مختلفة.");
    }
    if (!options.includes(alternative.answer.trim())) {
      throw retryableError("إجابة سؤال اختيار من متعدد لا تطابق أحد البدائل.");
    }
  } else if (alternative.options.length !== 0) {
    throw retryableError("سؤال غير موضوعي يحتوي بدائل اختيار من متعدد.");
  }
  const normalizedSupport = normalizeForEvidence(alternative.sourceSupport);
  const normalizedReference = normalizeForEvidence(reference.content);
  if (normalizedSupport.length < 12 || !normalizedReference.includes(normalizedSupport)) {
    throw retryableError("تعذر إثبات استناد أحد الأسئلة إلى نص المرجع حرفيًا.");
  }
}

function normalizeForEvidence(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/ـ/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findGeminiOutputText(payload: unknown): { text: string; partCount: number } {
  const record = asRecord(payload);
  if (!record) return { text: "", partCount: 0 };
  if (typeof record.output_text === "string" && record.output_text.trim()) {
    return { text: record.output_text, partCount: 1 };
  }
  if (!Array.isArray(record.steps)) return { text: "", partCount: 0 };
  const textParts: string[] = [];
  for (const step of record.steps) {
    const stepRecord = asRecord(step);
    if (stepRecord?.type !== "model_output" || !Array.isArray(stepRecord.content)) continue;
    for (const content of stepRecord.content) {
      const contentRecord = asRecord(content);
      if (contentRecord?.type === "text" && typeof contentRecord.text === "string" && contentRecord.text) {
        textParts.push(contentRecord.text);
      }
    }
  }
  return { text: textParts.join(""), partCount: textParts.length };
}

function geminiInteractionStatus(payload: unknown): string {
  const record = asRecord(payload);
  return typeof record?.status === "string" ? record.status : "unknown";
}

function assertCompletedGeminiInteraction(payload: unknown): void {
  const status = geminiInteractionStatus(payload);
  if (status === "completed" || status === "unknown") return;
  const statusMessages: Record<string, string> = {
    incomplete: "أوقف Gemini الاستجابة قبل اكتمال JSON.",
    budget_exceeded: "تجاوز Gemini ميزانية الرموز قبل اكتمال الاستجابة.",
    failed: "فشل Gemini في إكمال الاستجابة.",
    cancelled: "ألغى Gemini الاستجابة قبل اكتمالها.",
    requires_action: "أعاد Gemini استجابة تتطلب إجراء غير متوقع.",
    in_progress: "ما زالت استجابة Gemini قيد التنفيذ.",
    queued: "تأخرت استجابة Gemini في قائمة الانتظار.",
  };
  throw retryableError(statusMessages[status] || `أعاد Gemini حالة غير مكتملة: ${status}.`);
}

function geminiModelOutputError(payload: unknown): string {
  const record = asRecord(payload);
  if (!record || !Array.isArray(record.steps)) return "";
  for (const step of record.steps) {
    const stepRecord = asRecord(step);
    if (stepRecord?.type !== "model_output") continue;
    const error = asRecord(stepRecord.error);
    if (typeof error?.message === "string" && error.message.trim()) return error.message.trim();
  }
  return "";
}

function geminiError(payload: unknown, fallback: string): string {
  const record = asRecord(payload);
  const error = asRecord(record?.error);
  return typeof error?.message === "string" && error.message ? error.message : fallback;
}

async function requireUser(req: Request): Promise<void> {
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw httpError("يلزم تسجيل دخول مالك المنصة.", 401);
  const token = authorization.slice("Bearer ".length);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw httpError("جلسة مالك المنصة غير صالحة أو منتهية.", 401);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  const record = asRecord(value);
  if (!record) throw httpError(message, 400);
  return record;
}

function requireText(value: unknown, message: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) throw httpError(message, 400);
  const text = value.trim();
  if (text.length > maxLength) throw httpError(`${message} تجاوز الحد المسموح.`, 400);
  return text;
}

function requireInteger(value: unknown, message: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw httpError(message, 400);
  }
  return value;
}

function requireEnum<const T extends readonly string[]>(value: unknown, allowed: T, message: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value as T[number])) throw httpError(message, 400);
  return value as T[number];
}

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": origin === appOrigin ? origin : appOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

function json(req: Request, payload: unknown, status = 200): Response {
  return Response.json(payload, { status, headers: corsHeaders(req) });
}

function createRequestId(): string {
  return `WQ-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function logStage(requestId: string, stage: string, details: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ requestId, stage, ...details }));
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`متغير الخادم ${name} غير مضبوط.`);
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "حدث خطأ غير متوقع في مولد الأسئلة.";
}

function httpError(message: string, status: number): Error & { status: number; retryable?: boolean } {
  return Object.assign(new Error(message), { status });
}

function retryableError(message: string): Error & { status: number; retryable: boolean } {
  return Object.assign(new Error(message), { status: 502, retryable: true });
}

function errorStatus(error: unknown): number {
  if (typeof error === "object" && error !== null && "status" in error && typeof (error as { status?: unknown }).status === "number") {
    return (error as { status: number }).status;
  }
  return 500;
}

function isRetryableGenerationError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "retryable" in error && (error as { retryable?: unknown }).retryable === true;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
