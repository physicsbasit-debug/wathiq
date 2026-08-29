import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = requiredEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const GEMINI_API_KEY = requiredEnv("GEMINI_API_KEY");
const WATHIQ_APP_URL = requiredEnv("WATHIQ_APP_URL");
const GEMINI_IMAGE_MODEL = Deno.env.get("GEMINI_IMAGE_MODEL")?.trim() || "gemini-3.1-flash-image";
const GEMINI_REVIEW_MODEL = Deno.env.get("GEMINI_REVIEW_MODEL")?.trim()
  || Deno.env.get("GEMINI_AUTHOR_MODEL")?.trim()
  || "gemini-3.6-flash";
const IMAGE_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_IMAGE_MODEL)}:generateContent`;
const REVIEW_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_REVIEW_MODEL)}:generateContent`;
const QUESTION_VISUAL_BUCKET = "wathiq-question-visuals";
const VISUAL_PROMPT_VERSION = "wathiq-science-2d-reset-v3";
const IMAGE_GENERATION_TIMEOUT_MS = 70_000;
const IMAGE_REVIEW_TIMEOUT_MS = 45_000;
const MAX_IMAGE_BASE64_CHARACTERS = 18_000_000;
const appOrigin = new URL(WATHIQ_APP_URL).origin;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type RequiredMode = "replace";
type VisualRecord = Record<string, unknown>;

interface VisualRequestBase {
  draftId: string;
  planItemId: string;
  programmeId: "primary" | "lower_secondary" | "igcse";
  syllabusCode: string;
  stageLabel: string;
  subject: string;
  lessonLabel: string;
  questionText: string;
  reviewSupport: string;
  visual: VisualRecord;
}

interface GenerateRequest extends VisualRequestBase {
  action: "generate_image";
  correction: string;
}

interface ReviewRequest extends VisualRequestBase {
  action: "review_image";
  assetPath: string;
}

interface ProvisionalVisualAsset {
  url: string;
  assetPath: string;
  mimeType: string;
  model: string;
  generatedAt: string;
  promptVersion: string;
  assetKind: "scene_2d";
  renderMode: RequiredMode;
}

interface VisualReview {
  approved: boolean;
  requiredObjectsPresent: boolean;
  scientificRelationshipCorrect: boolean;
  spatialRelationshipsCorrect: boolean;
  noScientificContradiction: boolean;
  noExtraScientificObjects: boolean;
  clear2DComposition: boolean;
  printReady: boolean;
  forbiddenTextDetected: boolean;
  noAnswerLeakage: boolean;
  reason: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const requestId = crypto.randomUUID();
  if (req.method !== "POST") return json(req, { error: "هذه الخدمة تقبل POST فقط.", requestId }, 405);

  try {
    const userId = await requireUser(req);
    const payload = requireRecord(await req.json(), "الطلب غير صالح.");
    const action = payload.action;

    if (action === "generate_image") {
      const request = parseGenerateRequest(payload);
      log(requestId, "visual_request_received", {
        action,
        planItemId: request.planItemId,
        model: GEMINI_IMAGE_MODEL,
        visualType: textField(request.visual.type),
      });
      const result = await handleGenerateImage(request, userId, requestId);
      return json(req, { ...result, requestId });
    }

    if (action === "review_image") {
      const request = parseReviewRequest(payload);
      log(requestId, "visual_request_received", {
        action,
        planItemId: request.planItemId,
        reviewModel: GEMINI_REVIEW_MODEL,
        visualType: textField(request.visual.type),
      });
      const result = await handleReviewImage(request, userId, requestId);
      return json(req, { ...result, requestId });
    }

    throw httpError("العملية المطلوبة غير مدعومة.", 404);
  } catch (error) {
    log(requestId, "visual_request_failed", { status: errorStatus(error), category: failureCategory(error) });
    return json(req, { error: userSafeError(error), requestId }, errorStatus(error));
  }
});

function parseGenerateRequest(payload: Record<string, unknown>): GenerateRequest {
  const base = parseBaseRequest(payload);
  return {
    ...base,
    action: "generate_image",
    correction: typeof payload.correction === "string" ? payload.correction.trim().slice(0, 900) : "",
  };
}

function parseReviewRequest(payload: Record<string, unknown>): ReviewRequest {
  const base = parseBaseRequest(payload);
  return {
    ...base,
    action: "review_image",
    assetPath: requireText(payload.assetPath, "مسار الأصل غير صالح.", 500),
  };
}

function parseBaseRequest(payload: Record<string, unknown>): VisualRequestBase {
  const visual = requireRecord(payload.visual, "مواصفة الرسم العلمي غير صالحة.");
  const visualType = textField(visual.type);
  if (!visualType || visualType === "none") throw httpError("لا توجد حاجة إلى أصل بصري ثنائي الأبعاد لهذه المفردة.", 400);
  if (visualType !== "context_scene") {
    throw httpError("وظيفة الصور تقبل المرئيات العلمية ثنائية الأبعاد فقط؛ الجداول والرسوم البيانية الرقمية تبقى حتمية داخل واثق.", 409);
  }
  return {
    draftId: requireText(payload.draftId, "معرف المسودة غير صالح.", 140),
    planItemId: requireText(payload.planItemId, "معرف المفردة غير صالح.", 140),
    programmeId: requireProgrammeId(payload.programmeId),
    syllabusCode: requireText(payload.syllabusCode, "رمز منهج كامبريدج غير محدد.", 20),
    stageLabel: requireText(payload.stageLabel, "مرحلة كامبريدج غير محددة.", 120),
    subject: requireText(payload.subject, "المادة غير محددة.", 120),
    lessonLabel: requireText(payload.lessonLabel, "الدرس غير محدد.", 220),
    questionText: requireText(payload.questionText, "نص السؤال غير محدد.", 2_500),
    reviewSupport: requireText(payload.reviewSupport, "سياق المراجعة غير محدد.", 6_000),
    visual,
  };
}

async function handleGenerateImage(
  request: GenerateRequest,
  userId: string,
  requestId: string,
): Promise<{ status: "generated"; asset: ProvisionalVisualAsset }> {
  const image = await generateImage(request, request.correction, requestId, 1);
  const asset = await storeProvisionalImage(request, userId, image);
  log(requestId, "visual_generation_complete", {
    planItemId: request.planItemId,
    assetPath: asset.assetPath,
  });
  return { status: "generated", asset };
}

async function handleReviewImage(
  request: ReviewRequest,
  userId: string,
  requestId: string,
): Promise<{ status: "approved" | "scientific_rejection"; reason: string; correction?: string }> {
  const owner = storageSegment(userId);
  const expectedPathPrefix = `${owner}/${storageSegment(request.draftId)}/${storageSegment(request.planItemId)}/`;
  if (!request.assetPath.startsWith(expectedPathPrefix)) {
    throw httpError("الأصل لا يعود للمسودة والمفردة الحالية.", 400);
  }

  const { data: fileData, error: downloadError } = await admin.storage
    .from(QUESTION_VISUAL_BUCKET)
    .download(request.assetPath);
  if (downloadError || !fileData) throw httpError(`تعذر تحميل الأصل العلمي: ${downloadError?.message ?? "الملف غير موجود"}`, 500);

  const bytes = new Uint8Array(await fileData.arrayBuffer());
  const image = { data: encodeBase64(bytes), mimeType: fileData.type || "application/octet-stream" };
  if (!image.mimeType.startsWith("image/")) throw httpError("نوع الأصل العلمي المخزن غير صالح.", 400);
  if (!image.data || image.data.length > MAX_IMAGE_BASE64_CHARACTERS) throw httpError("حجم الأصل العلمي غير صالح للمراجعة.", 400);

  const review = await reviewImage(request, image, requestId, 1);
  if (review.approved) return { status: "approved", reason: review.reason };
  return {
    status: "scientific_rejection",
    reason: review.reason || "لم يجتز الأصل الفحص العلمي.",
    correction: reviewerCorrection(review),
  };
}

function illustrationBrief(request: VisualRequestBase): string {
  const visual = request.visual;
  const purpose = textField(visual.purpose);
  const altText = textField(visual.altText);
  const title = textField(visual.title);
  const labels = stringArray(visual.labels, 16, 120);
  const annotations = stringArray(visual.annotations, 16, 140);

  return [
    `برنامج كامبريدج: ${request.stageLabel}، رمز المنهج: ${request.syllabusCode}، المادة: ${request.subject}.`,
    `الدرس: ${request.lessonLabel}.`,
    `نص السؤال: ${request.questionText}`,
    `سياق المراجعة الحاكم: ${request.reviewSupport}`,
    `الغرض: ${purpose || "توضيح علمي يخدم حل السؤال دون إعطاء الإجابة"}.`,
    altText ? `الوصف المطلوب: ${altText}.` : "",
    title ? `العنوان الداخلي للمواصفة: ${title}.` : "",
    labels.length ? `عناصر/مسميات دلالية: ${labels.join("، ")}.` : "",
    annotations.length ? `ملاحظات دلالية: ${annotations.join("، ")}.` : "",
  ].filter(Boolean).join("\n");
}

function imagePrompt(request: VisualRequestBase, correction: string): string {
  return [
    "أنشئ رسماً علمياً تعليمياً ثنائي الأبعاد عالي الجودة لورقة اختبار علوم مدرسية.",
    "واثق لا يستخدم مولداً تخطيطياً خطياً للمشاهد العلمية. قد يكون المطلوب زنبركاً أو جهازاً أو قوة أو دائرة أو شحنات أو بصريات أو ضغطاً أو تسلسلاً؛ مثّل المشهد كرسوم كتاب مدرسي 2D واضحة لا كهيكل خطي بدائي.",
    "الجداول والرسوم البيانية ذات القيم الرقمية الدقيقة لا تصل إلى هذه الوظيفة أصلاً؛ لذلك لا تخترع بيانات كمية داخل الصورة.",
    "الأولوية المطلقة: الدقة العلمية، ثم الوضوح، ثم الجمال البصري.",
    "الأسلوب: رسم كتاب مدرسي حديث ونظيف، 2D حقيقي، خلفية بيضاء، تباين واضح، أشكال مفهومة وحواف نظيفة، مناسب للطباعة A4.",
    "لا تنسخ صورة منشورة أو شعاراً أو علامة تجارية. أنشئ رسماً أصلياً.",
    "لا تضف أي جسم أو جهاز أو علاقة علمية غير مطلوبة في الملخص أدناه.",
    "لا تضع نصوصاً أو أرقاماً أو وحدات أو أحرفاً أو عناوين داخل الصورة إلا إذا كانت ظاهرة أصلاً في نص الطالب ومطلوبة لفهم المشهد.",
    "لا تضف أسهماً أو رموز شحنة أو قيماً أو اتجاهات نتيجة من عندك. إذا كان السؤال يطلب من الطالب استنتاج الاتجاه أو العلاقة فلا ترسم النتيجة له.",
    "هذه صورة نهائية كاملة: أظهر الظاهرة أو الجهاز أو المشهد المطلوب بصرياً دون كشف الإجابة أو التفسير للطالب.",
    "يجب أن يكون الحجم والعلاقات المكانية معقولة علمياً، وألا يختلط عنصر بآخر أو تختفي عناصر مهمة.",
    illustrationBrief(request),
    correction ? `تصحيح إلزامي بعد المراجعة السابقة: ${correction}` : "",
  ].filter(Boolean).join("\n\n");
}

async function generateImage(
  request: VisualRequestBase,
  correction: string,
  requestId: string,
  attempt: number,
): Promise<{ data: string; mimeType: string }> {
  const startedAt = Date.now();
  const response = await timedFetch(IMAGE_API_URL, IMAGE_GENERATION_TIMEOUT_MS, {
    method: "POST",
    headers: { "x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: imagePrompt(request, correction) }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
  });
  const payload = await response.json() as unknown;
  if (!response.ok) throw providerError(payload, `تعذر إنشاء الرسم العلمي (${response.status}).`, response.status);
  const image = findGeneratedImage(payload);
  if (!image || image.data.length < 1_000 || image.data.length > MAX_IMAGE_BASE64_CHARACTERS) {
    throw httpError("لم يُرجع نموذج الصور أصلاً بصرياً صالحاً.", 502);
  }
  log(requestId, "visual_image_generated", {
    attempt,
    mimeType: image.mimeType,
    size: image.data.length,
    durationMs: Date.now() - startedAt,
  });
  return image;
}

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    approved: { type: "boolean" },
    requiredObjectsPresent: { type: "boolean" },
    scientificRelationshipCorrect: { type: "boolean" },
    spatialRelationshipsCorrect: { type: "boolean" },
    noScientificContradiction: { type: "boolean" },
    noExtraScientificObjects: { type: "boolean" },
    clear2DComposition: { type: "boolean" },
    printReady: { type: "boolean" },
    forbiddenTextDetected: { type: "boolean" },
    noAnswerLeakage: { type: "boolean" },
    reason: { type: "string" },
  },
  required: [
    "approved",
    "requiredObjectsPresent",
    "scientificRelationshipCorrect",
    "spatialRelationshipsCorrect",
    "noScientificContradiction",
    "noExtraScientificObjects",
    "clear2DComposition",
    "printReady",
    "forbiddenTextDetected",
    "noAnswerLeakage",
    "reason",
  ],
  additionalProperties: false,
} as const;

async function reviewImage(
  request: VisualRequestBase,
  image: { data: string; mimeType: string },
  requestId: string,
  attempt: number,
): Promise<VisualReview> {
  const startedAt = Date.now();
  const response = await timedFetch(REVIEW_API_URL, IMAGE_REVIEW_TIMEOUT_MS, {
    method: "POST",
    headers: { "x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: "أنت مراجع علمي بصري مستقل وصارم لأسئلة العلوم المدرسية. لا تجامل الصورة، ولا تعتمد جمالها إذا كان معناها العلمي خاطئاً." }],
      },
      contents: [{
        role: "user",
        parts: [
          { text: [
            "راجع الأصل 2D التالي مقارنة بنص الطالب وسياق المراجعة والمواصفة الدلالية.",
            "وافق فقط إذا كان الرسم صحيحاً علمياً، والعناصر المطلوبة وعلاقاتها المكانية صحيحة، ولا توجد عناصر علمية زائدة أو تضليل بصري.",
            "اعتبر أي نص/رقم/وحدة/سهم/رمز غير موجود في معلومات الطالب أو غير لازم للمشهد عيباً.",
            "ارفض الصورة إذا كشفت إجابة السؤال أو اتجاه النتيجة أو العلاقة التي يجب على الطالب استنتاجها، حتى لو كان الرسم جميلاً وصحيحاً علمياً.",
            "هذا أصل نهائي كامل؛ لا توجد طبقة تخطيطية خطية لاحقة ستصلح أخطاءه.",
            illustrationBrief(request),
          ].join("\n\n") },
          { inlineData: { mimeType: image.mimeType, data: image.data } },
        ],
      }],
      generationConfig: {
        candidateCount: 1,
        maxOutputTokens: 900,
        thinkingConfig: { thinkingLevel: "HIGH" },
        responseMimeType: "application/json",
        responseJsonSchema: REVIEW_SCHEMA,
      },
    }),
  });

  const payload = await response.json() as unknown;
  if (!response.ok) throw providerError(payload, `تعذر تدقيق الرسم العلمي (${response.status}).`, response.status);

  const output = findOutputText(payload);
  if (!output) {
    logReviewFailureMetadata(requestId, request.planItemId, response.status, payload, "no_output", Date.now() - startedAt);
    throw httpError("لم يُرجع المراجع العلمي نتيجة قابلة للقراءة.", 502);
  }

  let parsed: unknown;
  try {
    parsed = parseJson(output);
  } catch (error) {
    logReviewFailureMetadata(requestId, request.planItemId, response.status, payload, "invalid_json", Date.now() - startedAt);
    throw error;
  }

  const review = requireVisualReview(parsed);
  review.approved = review.approved
    && review.requiredObjectsPresent
    && review.scientificRelationshipCorrect
    && review.spatialRelationshipsCorrect
    && review.noScientificContradiction
    && review.noExtraScientificObjects
    && review.clear2DComposition
    && review.printReady
    && !review.forbiddenTextDetected
    && review.noAnswerLeakage;

  log(requestId, "visual_image_reviewed", {
    attempt,
    approved: review.approved,
    durationMs: Date.now() - startedAt,
  });
  return review;
}

function requireVisualReview(value: unknown): VisualReview {
  const record = asRecord(value);
  if (!record) throw httpError("استجابة المراجع العلمي غير صالحة.", 502);
  const booleanFields = [
    "approved",
    "requiredObjectsPresent",
    "scientificRelationshipCorrect",
    "spatialRelationshipsCorrect",
    "noScientificContradiction",
    "noExtraScientificObjects",
    "clear2DComposition",
    "printReady",
    "forbiddenTextDetected",
    "noAnswerLeakage",
  ] as const;
  for (const field of booleanFields) {
    if (typeof record[field] !== "boolean") throw httpError(`استجابة المراجع العلمي غير صالحة: ${field}.`, 502);
  }
  if (typeof record.reason !== "string") throw httpError("استجابة المراجع العلمي غير صالحة: reason.", 502);
  return {
    approved: record.approved,
    requiredObjectsPresent: record.requiredObjectsPresent,
    scientificRelationshipCorrect: record.scientificRelationshipCorrect,
    spatialRelationshipsCorrect: record.spatialRelationshipsCorrect,
    noScientificContradiction: record.noScientificContradiction,
    noExtraScientificObjects: record.noExtraScientificObjects,
    clear2DComposition: record.clear2DComposition,
    printReady: record.printReady,
    forbiddenTextDetected: record.forbiddenTextDetected,
    noAnswerLeakage: record.noAnswerLeakage,
    reason: record.reason.trim().slice(0, 500),
  };
}

function reviewerCorrection(review: VisualReview): string {
  const failures: string[] = [];
  if (!review.requiredObjectsPresent) failures.push("أظهر كل العناصر المطلوبة بوضوح");
  if (!review.scientificRelationshipCorrect) failures.push("صحح العلاقة العلمية بين العناصر");
  if (!review.spatialRelationshipsCorrect) failures.push("صحح المواقع والاتجاهات والمسافات النسبية");
  if (!review.noScientificContradiction) failures.push("أزل أي تناقض علمي");
  if (!review.noExtraScientificObjects) failures.push("احذف العناصر العلمية غير المطلوبة");
  if (!review.clear2DComposition) failures.push("بسّط التكوين واجعله واضحاً كرسوم الكتب المدرسية");
  if (!review.printReady) failures.push("حسّن الوضوح للطباعة");
  if (review.forbiddenTextDetected) failures.push("احذف النصوص والأرقام والرموز غير المطلوبة");
  if (!review.noAnswerLeakage) failures.push("أعد بناء المشهد دون إظهار الإجابة أو اتجاه النتيجة التي يجب على الطالب استنتاجها");
  return `${review.reason || "أعد بناء الرسم وفق المواصفة."}${failures.length ? `؛ ${failures.join("؛ ")}` : ""}`.slice(0, 900);
}

async function storeProvisionalImage(
  request: VisualRequestBase,
  userId: string,
  image: { data: string; mimeType: string },
): Promise<ProvisionalVisualAsset> {
  await ensureBucket();
  const extension = image.mimeType === "image/jpeg" ? "jpg" : image.mimeType === "image/webp" ? "webp" : "png";
  const owner = storageSegment(userId);
  const assetPath = `${owner}/${storageSegment(request.draftId)}/${storageSegment(request.planItemId)}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const uploaded = await admin.storage.from(QUESTION_VISUAL_BUCKET).upload(assetPath, decodeBase64(image.data), {
    contentType: image.mimeType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploaded.error) throw httpError(`تعذر حفظ الأصل العلمي: ${uploaded.error.message}`, 500);
  const publicUrl = admin.storage.from(QUESTION_VISUAL_BUCKET).getPublicUrl(assetPath).data.publicUrl;
  if (!publicUrl?.startsWith("https://")) throw httpError("تعذر إنشاء رابط آمن للأصل العلمي.", 500);
  return {
    url: publicUrl,
    assetPath,
    mimeType: image.mimeType,
    model: GEMINI_IMAGE_MODEL,
    generatedAt: new Date().toISOString(),
    promptVersion: VISUAL_PROMPT_VERSION,
    assetKind: "scene_2d",
    renderMode: "replace",
  };
}

async function ensureBucket(): Promise<void> {
  const current = await admin.storage.getBucket(QUESTION_VISUAL_BUCKET);
  if (!current.error) return;
  const created = await admin.storage.createBucket(QUESTION_VISUAL_BUCKET, {
    public: true,
    fileSizeLimit: 12 * 1024 * 1024,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
  });
  if (created.error && !/already exists|duplicate/iu.test(created.error.message)) {
    throw httpError(`تعذر تجهيز مخزن الصور: ${created.error.message}`, 500);
  }
}

function findGeneratedImage(payload: unknown): { data: string; mimeType: string } | null {
  const root = asRecord(payload);
  const candidates = Array.isArray(root?.candidates) ? root.candidates : [];
  for (const candidateValue of candidates) {
    const candidate = asRecord(candidateValue);
    const content = asRecord(candidate?.content);
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    for (const partValue of parts) {
      const part = asRecord(partValue);
      const inline = asRecord(part?.inlineData) ?? asRecord(part?.inline_data);
      const data = typeof inline?.data === "string" ? inline.data : "";
      const mimeType = typeof inline?.mimeType === "string" ? inline.mimeType
        : typeof inline?.mime_type === "string" ? inline.mime_type : "";
      if (data && mimeType.startsWith("image/")) return { data, mimeType };
    }
  }
  return null;
}

function findOutputText(payload: unknown): string {
  const root = asRecord(payload);
  const candidates = Array.isArray(root?.candidates) ? root.candidates : [];
  const first = asRecord(candidates[0]);
  const content = asRecord(first?.content);
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  return parts.map((part) => textField(asRecord(part)?.text)).filter(Boolean).join("\n").trim();
}

function parseJson(value: string): unknown {
  const cleaned = value.replace(/^\uFEFF/u, "").trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "").trim();
  try { return JSON.parse(cleaned); }
  catch {
    const start = cleaned.indexOf("{");
    if (start >= 0) {
      let depth = 0;
      let quoted = false;
      let escaped = false;
      for (let index = start; index < cleaned.length; index += 1) {
        const char = cleaned[index];
        if (quoted) {
          if (escaped) escaped = false;
          else if (char === "\\") escaped = true;
          else if (char === "\"") quoted = false;
          continue;
        }
        if (char === "\"") { quoted = true; continue; }
        if (char === "{") depth += 1;
        else if (char === "}") {
          depth -= 1;
          if (depth === 0) {
            try { return JSON.parse(cleaned.slice(start, index + 1)); }
            catch { break; }
          }
        }
      }
    }
    throw httpError("تعذر قراءة نتيجة المراجع العلمي.", 502);
  }
}

function logReviewFailureMetadata(
  requestId: string,
  planItemId: string,
  status: number,
  payload: unknown,
  category: string,
  durationMs: number,
): void {
  const root = asRecord(payload);
  const candidates = Array.isArray(root?.candidates) ? root.candidates : [];
  const first = asRecord(candidates[0]);
  const content = asRecord(first?.content);
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  const textLength = parts.reduce((sum, part) => sum + textField(asRecord(part)?.text).length, 0);
  log(requestId, "visual_review_response_failure", {
    planItemId,
    httpStatus: status,
    candidateCount: candidates.length,
    partsCount: parts.length,
    hasText: textLength > 0,
    textLength,
    finishReason: textField(first?.finishReason),
    failureCategory: category,
    durationMs,
  });
}

async function requireUser(req: Request): Promise<string> {
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw httpError("يلزم تسجيل دخول مالك المنصة.", 401);
  const token = authorization.slice("Bearer ".length);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw httpError("جلسة مالك المنصة غير صالحة أو منتهية.", 401);
  return data.user.id;
}

function providerError(payload: unknown, fallback: string, status: number): Error & { status: number } {
  const root = asRecord(payload);
  const nested = asRecord(root?.error);
  const message = textField(nested?.message) || textField(root?.message) || fallback;
  return httpError(message, status);
}

function userSafeError(error: unknown): string {
  const status = errorStatus(error);
  if ([408, 429, 500, 502, 503, 504].includes(status)) {
    return "خدمة إنشاء الرسم العلمي مزدحمة أو غير متاحة مؤقتاً. احتفظ واثق بالمفردة ويمكن إعادة الأصل 2D لاحقاً.";
  }
  return errorMessage(error);
}

function failureCategory(error: unknown): string {
  const status = errorStatus(error);
  if (status === 408 || status === 504) return "timeout";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "upstream_or_protocol";
  return "request";
}

async function timedFetch(url: string, timeoutMs: number, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw httpError("انتهت مهلة خدمة الذكاء الاصطناعي.", 504);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) output[index] = binary.charCodeAt(index);
  return output;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function storageSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "item";
}

function stringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxLength)).filter(Boolean).slice(0, maxItems);
}

function textField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  const record = asRecord(value);
  if (!record) throw httpError(message, 400);
  return record;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function requireText(value: unknown, message: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) throw httpError(message, 400);
  const text = value.trim();
  if (text.length > maxLength) throw httpError(`${message} تجاوز الحد المسموح.`, 400);
  return text;
}

function requireProgrammeId(value: unknown): "primary" | "lower_secondary" | "igcse" {
  if (value === "primary" || value === "lower_secondary" || value === "igcse") return value;
  throw httpError("برنامج كامبريدج غير صالح.", 400);
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`الإعداد ${name} غير موجود.`);
  return value;
}

function httpError(message: string, status: number): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

function errorStatus(error: unknown): number {
  if (typeof error === "object" && error !== null && "status" in error && typeof (error as { status?: unknown }).status === "number") {
    return (error as { status: number }).status;
  }
  return 500;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  const record = asRecord(error);
  for (const key of ["error", "message", "details", "hint"]) {
    if (typeof record?.[key] === "string" && record[key]) return record[key] as string;
  }
  return "حدث خطأ غير متوقع في منظومة الرسم العلمي.";
}

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("Origin") ?? "";
  const allowedOrigin = origin === appOrigin || origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")
    ? origin : appOrigin;
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8" },
  });
}

function log(requestId: string, event: string, payload: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event: `wathiq_${event}`, requestId, ...payload }));
}
