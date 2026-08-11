import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = requiredEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const WATHIQ_APP_URL = requiredEnv("WATHIQ_APP_URL");
const GEMINI_API_KEY = requiredEnv("GEMINI_API_KEY");
const GEMINI_OCR_MODEL = Deno.env.get("GEMINI_OCR_MODEL")?.trim() || "gemini-3.6-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_OCR_MODEL)}:generateContent`;
const appOrigin = new URL(WATHIQ_APP_URL).origin;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MODEL_TIMEOUT_MS = 45_000;
const RETRY_DELAYS_MS = [1_000, 3_000] as const;
const TRANSIENT = new Set([408, 429, 500, 502, 503, 504]);

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "هذه الخدمة تقبل POST فقط." }, 405);
  const requestId = crypto.randomUUID();
  try {
    const user = await requireUser(req);
    const sourceId = requireText(req.headers.get("x-wathiq-source-id"), "معرف المصدر غير موجود.", 160);
    const pageNumber = positiveInteger(req.headers.get("x-wathiq-page-number"), "رقم الصفحة غير صالح.");
    const totalPages = positiveInteger(req.headers.get("x-wathiq-total-pages"), "عدد الصفحات غير صالح.");
    if (pageNumber > totalPages || totalPages > 300) throw httpError("نطاق صفحات OCR غير صالح.", 400);
    const mimeType = (req.headers.get("content-type") ?? "").split(";")[0]?.trim();
    if (mimeType !== "image/jpeg" && mimeType !== "image/png") throw httpError("تقبل خدمة OCR صور JPEG أو PNG فقط.", 415);
    await assertSourceOwned(sourceId, user.userId);
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (!bytes.length) throw httpError("صورة الصفحة فارغة.", 400);
    if (bytes.length > MAX_IMAGE_BYTES) throw httpError("صورة الصفحة تتجاوز الحد الآمن 10 ميجابايت.", 413);

    const content = normalizeText(await recognizePage(bytes, mimeType, pageNumber, totalPages, requestId));
    const processedAt = new Date().toISOString();
    const { error: saveError } = await admin.from("source_ocr_pages").upsert({
      owner_id: user.userId,
      source_id: sourceId,
      page_number: pageNumber,
      content,
      character_count: content.length,
      confidence: null,
      provider: `gemini:${GEMINI_OCR_MODEL}`,
      processed_at: processedAt,
    }, { onConflict: "owner_id,source_id,page_number" });
    if (saveError) throw new Error(`تعذر حفظ OCR للصفحة ${pageNumber}: ${saveError.message}`);

    return json(req, {
      ok: true,
      pageNumber,
      content,
      characterCount: content.length,
      confidence: null,
      provider: `gemini:${GEMINI_OCR_MODEL}`,
      processedAt,
      requestId,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "wathiq_source_ocr_failed", requestId, message: errorMessage(error) }));
    return json(req, { error: errorMessage(error), requestId }, errorStatus(error));
  }
});

async function recognizePage(
  bytes: Uint8Array,
  mimeType: string,
  pageNumber: number,
  totalPages: number,
  requestId: string,
): Promise<string> {
  const body = {
    systemInstruction: { parts: [{ text: [
      "أنت قارئ OCR فقط لوثائق تعليمية عربية وإنجليزية.",
      "استخرج النص الظاهر في الصفحة كما هو، مع الحفاظ قدر الإمكان على ترتيب الأسطر والعناوين.",
      "لا تشرح ولا تلخص ولا تصحح المحتوى ولا تضف أي كلمة غير موجودة في الصورة.",
      "إذا كان جزء غير مقروء فاتركه بدل اختلاقه.",
      "أعد النص فقط دون Markdown أو مقدمات.",
    ].join("\n") }] },
    contents: [{ role: "user", parts: [
      { text: `استخرج نص الصفحة ${pageNumber} من ${totalPages}.` },
      { inlineData: { mimeType, data: bytesToBase64(bytes) } },
    ] }],
    generationConfig: {
      maxOutputTokens: 8_000,
    },
  };

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
    try {
      const response = await fetch(GEMINI_API_URL, {
        method: "POST",
        headers: { "x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) {
        const provider = providerError(payload, `Gemini OCR HTTP ${response.status}`);
        const delayMs = RETRY_DELAYS_MS[attempt];
        if (TRANSIENT.has(response.status) && delayMs !== undefined) {
          console.warn(JSON.stringify({ event: "wathiq_source_ocr_retry", requestId, pageNumber, status: response.status, attempt: attempt + 1, provider: provider.slice(0, 200) }));
          await delay(delayMs + Math.floor(Math.random() * 500));
          continue;
        }
        throw httpError(TRANSIENT.has(response.status) ? "خدمة قراءة الصفحة مشغولة مؤقتًا. أعد المحاولة بعد قليل." : "تعذر قراءة الصفحة عبر OCR.", TRANSIENT.has(response.status) ? 503 : 502);
      }
      const text = outputText(payload);
      if (!text) throw httpError("لم تُرجع خدمة OCR نصًا قابلًا للقراءة.", 422);
      return text;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw httpError("تأخرت خدمة OCR أكثر من المدة المسموحة.", 504);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw httpError("تعذر قراءة الصفحة عبر OCR.", 503);
}

async function assertSourceOwned(sourceId: string, ownerId: string): Promise<void> {
  const { data, error } = await admin.from("source_registry").select("id").eq("owner_id", ownerId).eq("id", sourceId).maybeSingle();
  if (error) throw new Error(`تعذر التحقق من المصدر: ${error.message}`);
  if (!data) throw httpError("المصدر غير موجود أو لا يخص هذا الحساب.", 404);
}

async function requireUser(req: Request): Promise<{ userId: string }> {
  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw httpError("يلزم تسجيل الدخول أولًا.", 401);
  const token = authorization.slice(7).trim();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user?.id) throw httpError("جلسة المستخدم غير صالحة.", 401);
  return { userId: data.user.id };
}

function outputText(payload: Record<string, unknown>): string {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const content = (candidate as Record<string, unknown>).content;
    if (!content || typeof content !== "object") continue;
    const parts = (content as Record<string, unknown>).parts;
    if (!Array.isArray(parts)) continue;
    const text = parts.map((part) => part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string" ? String((part as Record<string, unknown>).text) : "").join("\n").trim();
    if (text) return text;
  }
  return "";
}

function providerError(payload: Record<string, unknown>, fallback: string): string {
  const error = payload.error;
  if (error && typeof error === "object" && typeof (error as Record<string, unknown>).message === "string") return String((error as Record<string, unknown>).message);
  return fallback;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunk, bytes.length)));
  return btoa(binary);
}

function normalizeText(value: string): string {
  return value.replace(/```(?:text)?/giu, "").replace(/```/gu, "").replace(/\u0000/gu, "").replace(/[ \t]+\n/gu, "\n").replace(/\n{3,}/gu, "\n\n").trim();
}

function positiveInteger(value: string | null, message: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw httpError(message, 400);
  return number;
}

function requireText(value: string | null, message: string, max = 200): string {
  const text = String(value ?? "").trim();
  if (!text || text.length > max) throw httpError(message, 400);
  return text;
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "خطأ غير معروف");
}

function errorStatus(error: unknown): number {
  return typeof error === "object" && error !== null && "status" in error && typeof (error as { status?: unknown }).status === "number" ? Number((error as { status: number }).status) : 500;
}

function httpError(message: string, status: number): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8" } });
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowedOrigin = origin === appOrigin ? origin : appOrigin;
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-wathiq-source-id, x-wathiq-page-number, x-wathiq-total-pages",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
