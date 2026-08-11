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
const VISUAL_PROMPT_VERSION = "wathiq-quality-reset-2d-v1";
const IMAGE_GENERATION_TIMEOUT_MS = 70_000;
const IMAGE_REVIEW_TIMEOUT_MS = 45_000;
const MAX_IMAGE_BASE64_CHARACTERS = 18_000_000;
const appOrigin = new URL(WATHIQ_APP_URL).origin;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type RequiredMode = "replace";

type VisualRecord = Record<string, unknown>;

interface VisualIllustrationRequest {
  action: "generate_visual_illustration";
  draftId: string;
  planItemId: string;
  grade: number;
  subject: string;
  lessonLabel: string;
  questionText: string;
  sourceSupport: string;
  previousAssetPath: string;
  visual: VisualRecord;
}

interface VisualIllustrationAsset {
  url: string;
  assetPath: string;
  mimeType: string;
  model: string;
  generatedAt: string;
  promptVersion: string;
  validated: true;
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
  reason: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const requestId = crypto.randomUUID();
  if (req.method !== "POST") return json(req, { error: "هذه الخدمة تقبل POST فقط.", requestId }, 405);

  try {
    const userId = await requireUser(req);
    const payload = requireRecord(await req.json(), "الطلب غير صالح.");
    if (payload.action !== "generate_visual_illustration") {
      throw httpError("هذه الوظيفة مخصصة لإنشاء الأصول العلمية ثنائية الأبعاد فقط.", 404);
    }
    const request = parseVisualRequest(payload);
    log(requestId, "visual_request_received", {
      planItemId: request.planItemId,
      model: GEMINI_IMAGE_MODEL,
      reviewModel: GEMINI_REVIEW_MODEL,
      visualType: textField(request.visual.type),
    });

    const result = await generateReviewedIllustration(request, userId, requestId);
    return json(req, { ...result, requestId });
  } catch (error) {
    log(requestId, "visual_request_failed", { message: errorMessage(error), status: errorStatus(error) });
    return json(req, { error: userSafeError(error), requestId }, errorStatus(error));
  }
});

function parseVisualRequest(payload: Record<string, unknown>): VisualIllustrationRequest {
  const visual = requireRecord(payload.visual, "مواصفة الرسم العلمي غير صالحة.");
  const visualType = textField(visual.type);
  if (!visualType || visualType === "none") throw httpError("لا توجد حاجة إلى أصل بصري ثنائي الأبعاد لهذه المفردة.", 400);
  return {
    action: "generate_visual_illustration",
    draftId: requireText(payload.draftId, "معرف المسودة غير صالح.", 140),
    planItemId: requireText(payload.planItemId, "معرف المفردة غير صالح.", 140),
    grade: requireInteger(payload.grade, "الصف الدراسي غير صالح.", 1, 12),
    subject: requireText(payload.subject, "المادة غير محددة.", 120),
    lessonLabel: requireText(payload.lessonLabel, "الدرس غير محدد.", 220),
    questionText: requireText(payload.questionText, "نص السؤال غير محدد.", 2_500),
    sourceSupport: requireText(payload.sourceSupport, "دليل المصدر غير محدد.", 6_000),
    previousAssetPath: typeof payload.previousAssetPath === "string" ? payload.previousAssetPath.trim().slice(0, 500) : "",
    visual,
  };
}

async function generateReviewedIllustration(
  request: VisualIllustrationRequest,
  userId: string,
  requestId: string,
): Promise<{ status: "ready" | "failed"; illustration?: VisualIllustrationAsset; reason: string }> {
  let correction = "";
  let lastReason = "";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const image = await generateImage(request, correction, requestId, attempt);
      const review = await reviewImage(request, image, requestId, attempt);
      if (review.approved) {
        const illustration = await storeImage(request, userId, image);
        return {
          status: "ready",
          illustration,
          reason: `اعتمد واثق الأصل العلمي 2D بعد مراجعة علمية مستقلة (${attempt}/2).`,
        };
      }
      lastReason = review.reason || "لم يجتز الأصل البصري فحص الدقة العلمية.";
      correction = reviewerCorrection(review);
      log(requestId, "visual_retry_requested", { attempt, reason: lastReason });
    } catch (error) {
      lastReason = errorMessage(error);
      if (!isRetryableError(error) || attempt >= 2) break;
      await delay(attempt === 1 ? 2_000 + Math.floor(Math.random() * 900) : 5_000);
    }
  }

  return {
    status: "failed",
    reason: `${lastReason || "تعذر اعتماد الأصل العلمي 2D."} لا يستخدم واثق أي رسم خطي بديل؛ أعد إنشاء الأصل 2D.`.slice(0, 420),
  };
}

function illustrationBrief(request: VisualIllustrationRequest): string {
  const visual = request.visual;
  const purpose = textField(visual.purpose);
  const altText = textField(visual.altText);
  const title = textField(visual.title);
  const labels = stringArray(visual.labels, 16, 120);
  const annotations = stringArray(visual.annotations, 16, 140);
  const components = stringArray(visual.components, 20, 80);

  return [
    `المادة: ${request.subject}، الصف: ${request.grade}.`,
    `الدرس: ${request.lessonLabel}.`,
    `نص السؤال: ${request.questionText}`,
    `دليل المصدر الحاكم: ${request.sourceSupport}`,
    `الغرض: ${purpose || "توضيح علمي يخدم حل السؤال دون إعطاء الإجابة"}.`,
    altText ? `الوصف المطلوب: ${altText}.` : "",
    title ? `العنوان الداخلي للمواصفة: ${title}.` : "",
    labels.length ? `عناصر/مسميات دلالية: ${labels.join("، ")}.` : "",
    components.length ? `مكونات مطلوبة: ${components.join("، ")}.` : "",
    annotations.length ? `ملاحظات دلالية: ${annotations.join("، ")}.` : "",
  ].filter(Boolean).join("\n");
}

function renderModeForVisual(_visual: VisualRecord): RequiredMode {
  // Quality reset: every illustrative scientific asset is a complete validated 2D replacement.
  // Exact numeric representations (tables/graphs/scales) never enter this image function.
  return "replace";
}

function imagePrompt(request: VisualIllustrationRequest, correction: string): string {
  return [
    "أنشئ رسماً علمياً تعليمياً ثنائي الأبعاد عالي الجودة لورقة اختبار علوم مدرسية.",
    "الأولوية المطلقة: الدقة العلمية، ثم الوضوح، ثم الجمال البصري.",
    "الأسلوب: رسم كتاب مدرسي حديث ونظيف، 2D حقيقي، خلفية بيضاء، تباين واضح، مناسب للطباعة A4.",
    "لا تنسخ صورة منشورة أو شعاراً أو علامة تجارية. أنشئ رسماً أصلياً.",
    "لا تضف أي جسم أو جهاز أو علاقة علمية غير مطلوبة في الملخص أدناه.",
    "لا تضع نصوصاً أو أرقاماً أو وحدات أو أحرفاً أو عناوين داخل الصورة إلا إذا نص الملخص صراحة على أن هذه الكتابة جزء ضروري من السؤال.",
    "لا تضع أسهماً أو رموز شحنة أو قيم قياس من عندك إلا إذا كانت ضرورية علمياً ومطلوبة صراحة في ملخص المرئي.",
    "هذه صورة نهائية كاملة: أظهر الظاهرة أو المشهد المطلوب بصرياً دون كشف الإجابة للطالب.",
    "يجب أن يكون الحجم والعلاقات المكانية معقولة علمياً، وألا يختلط عنصر بآخر أو تختفي عناصر مهمة.",
    illustrationBrief(request),
    correction ? `تصحيح إلزامي بعد المراجعة السابقة: ${correction}` : "",
  ].filter(Boolean).join("\n\n");
}

async function generateImage(
  request: VisualIllustrationRequest,
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
    reason: { type: "string" },
  },
  required: [
    "approved", "requiredObjectsPresent", "scientificRelationshipCorrect", "spatialRelationshipsCorrect",
    "noScientificContradiction", "noExtraScientificObjects", "clear2DComposition", "printReady",
    "forbiddenTextDetected", "reason",
  ],
  additionalProperties: false,
};

async function reviewImage(
  request: VisualIllustrationRequest,
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
            "راجع الأصل 2D التالي مقارنة بالسؤال ودليل المصدر والمواصفة الدلالية.",
            "وافق فقط إذا كان الرسم صحيحاً علمياً، والعناصر المطلوبة وعلاقاتها المكانية صحيحة، ولا توجد عناصر علمية زائدة أو تضليل بصري.",
            "اعتبر أي نص/رقم/وحدة/سهم/رمز غير مطلوب صراحة عيباً.",
            "هذا أصل نهائي كامل؛ يجب أن يخدم السؤال دون كشف الإجابة، ولا توجد طبقة خطية لاحقة ستصلح أخطاءه.",
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
  if (!output) throw httpError("لم يُرجع المراجع العلمي نتيجة قابلة للقراءة.", 502);
  const record = requireRecord(parseJson(output), "استجابة المراجع العلمي غير صالحة.");
  const review: VisualReview = {
    approved: record.approved === true,
    requiredObjectsPresent: record.requiredObjectsPresent === true,
    scientificRelationshipCorrect: record.scientificRelationshipCorrect === true,
    spatialRelationshipsCorrect: record.spatialRelationshipsCorrect === true,
    noScientificContradiction: record.noScientificContradiction === true,
    noExtraScientificObjects: record.noExtraScientificObjects === true,
    clear2DComposition: record.clear2DComposition === true,
    printReady: record.printReady === true,
    forbiddenTextDetected: record.forbiddenTextDetected === true,
    reason: typeof record.reason === "string" ? record.reason.trim().slice(0, 500) : "",
  };
  review.approved = review.approved
    && review.requiredObjectsPresent
    && review.scientificRelationshipCorrect
    && review.spatialRelationshipsCorrect
    && review.noScientificContradiction
    && review.noExtraScientificObjects
    && review.clear2DComposition
    && review.printReady
    && !review.forbiddenTextDetected;
  log(requestId, "visual_image_reviewed", { attempt, approved: review.approved, reason: review.reason, durationMs: Date.now() - startedAt });
  return review;
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
  return `${review.reason || "أعد بناء الرسم وفق المواصفة."}${failures.length ? `؛ ${failures.join("؛ ")}` : ""}`.slice(0, 900);
}

async function storeImage(
  request: VisualIllustrationRequest,
  userId: string,
  image: { data: string; mimeType: string },
): Promise<VisualIllustrationAsset> {
  await ensureBucket();
  const renderMode = renderModeForVisual(request.visual);
  const assetKind = "scene_2d" as const;
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

  const previous = request.previousAssetPath;
  if (previous && previous !== assetPath && previous.startsWith(`${owner}/`)) {
    void admin.storage.from(QUESTION_VISUAL_BUCKET).remove([previous]);
  }

  return {
    url: publicUrl,
    assetPath,
    mimeType: image.mimeType,
    model: GEMINI_IMAGE_MODEL,
    generatedAt: new Date().toISOString(),
    promptVersion: VISUAL_PROMPT_VERSION,
    validated: true,
    assetKind,
    renderMode,
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
  const cleaned = value.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "").trim();
  try { return JSON.parse(cleaned); }
  catch { throw httpError("تعذر قراءة نتيجة المراجع العلمي.", 502); }
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

function isRetryableError(error: unknown): boolean {
  return [408, 429, 500, 502, 503, 504].includes(errorStatus(error));
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

function requireInteger(value: unknown, message: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw httpError(message, 400);
  return value;
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
