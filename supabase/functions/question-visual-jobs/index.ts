import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = requiredEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const WATHIQ_APP_URL = requiredEnv("WATHIQ_APP_URL");
const appOrigin = new URL(WATHIQ_APP_URL).origin;
const GENERATION_ENDPOINT = `${SUPABASE_URL}/functions/v1/science-visual-generation`;
const TABLE = "question_visual_jobs";
const QUESTION_VISUAL_BUCKET = "wathiq-question-visuals";
const MAX_ITEMS = 20;
const STALE_JOB_MS = 5 * 60_000;
const INTERNAL_GENERATION_TIMEOUT_MS = 165_000;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type JobStatus = "queued" | "generating" | "validating" | "ready" | "retry_pending" | "failed" | "cancelled";
type RequiredMode = "replace";

interface VisualJobInput {
  draftId: string;
  planItemId: string;
  programmeId: "primary" | "lower_secondary" | "igcse";
  syllabusCode: string;
  stageLabel: string;
  subject: string;
  lessonLabel: string;
  questionText: string;
  reviewSupport: string;
  previousAssetPath: string;
  requiredMode: RequiredMode;
  visual: Record<string, unknown>;
}

interface VisualAsset {
  url: string;
  assetPath: string;
  mimeType: string;
  model: string;
  generatedAt: string;
  promptVersion: string;
  validated: true;
  assetKind?: "scene_2d";
  renderMode?: RequiredMode;
}

interface JobRow {
  id: string;
  owner_id: string;
  draft_id: string;
  plan_item_id: string;
  visual_hash: string;
  required_mode: RequiredMode;
  status: JobStatus;
  request_payload: VisualJobInput;
  asset: VisualAsset | null;
  attempt_count: number;
  max_attempts: number;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  heartbeat_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface RuntimeWithBackgroundTasks {
  EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "هذه الخدمة تقبل POST فقط." }, 405);

  const requestId = crypto.randomUUID();
  try {
    const auth = await requireUser(req);
    const payload = requireRecord(await req.json(), "الطلب غير صالح.");
    const action = requireText(payload.action, "نوع العملية غير محدد.", 30);

    if (action === "enqueue") {
      const draftId = requireText(payload.draftId, "معرف المسودة غير صالح.", 120);
      const rawItems = Array.isArray(payload.items) ? payload.items : [];
      if (!rawItems.length || rawItems.length > MAX_ITEMS) throw httpError(`عدد مهام الصور يجب أن يكون بين 1 و${MAX_ITEMS}.`, 400);
      const contextItems = rawItems.filter(isContextSceneJobInput);
      if (!contextItems.length) return json(req, { jobs: [], requestId });
      const inputs = contextItems.map((item) => parseJobInput(item, draftId));
      const rows = await enqueueJobs(auth.userId, inputs);
      scheduleRows(rows, auth.accessToken, requestId);
      return json(req, { jobs: rows.map(toSnapshot), requestId });
    }

    if (action === "list") {
      const draftId = requireText(payload.draftId, "معرف المسودة غير صالح.", 120);
      await recoverStaleJobs(auth.userId, draftId);
      const rows = await listJobs(auth.userId, draftId);
      scheduleRows(rows, auth.accessToken, requestId);
      return json(req, { jobs: rows.map(toSnapshot), requestId });
    }

    if (action === "retry") {
      const jobId = requireUuid(payload.jobId, "معرف مهمة الصورة غير صالح.");
      const row = await resetJobForRetry(auth.userId, jobId);
      scheduleRows([row], auth.accessToken, requestId);
      return json(req, { jobs: [toSnapshot(row)], requestId });
    }

    if (action === "cancel") {
      const jobId = requireUuid(payload.jobId, "معرف مهمة الصورة غير صالح.");
      const row = await cancelJob(auth.userId, jobId);
      return json(req, { jobs: [toSnapshot(row)], requestId });
    }

    throw httpError("العملية المطلوبة غير مدعومة.", 404);
  } catch (error) {
    console.error(JSON.stringify({ event: "wathiq_visual_jobs_failed", requestId, message: errorMessage(error) }));
    return json(req, { error: errorMessage(error), requestId }, errorStatus(error));
  }
});

async function enqueueJobs(ownerId: string, inputs: VisualJobInput[]): Promise<JobRow[]> {
  const rows: JobRow[] = [];
  for (const input of inputs) {
    const visualHash = await hashInput(input);
    const existing = await findJob(ownerId, input.draftId, input.planItemId);
    const effectiveInput: VisualJobInput = {
      ...input,
      previousAssetPath: input.previousAssetPath
        || existing?.asset?.assetPath
        || existing?.request_payload.previousAssetPath
        || "",
    };
    if (existing && existing.visual_hash === visualHash) {
      if (existing.status === "failed" || existing.status === "cancelled") {
        rows.push(await updateJob(existing.id, ownerId, {
          status: "retry_pending",
          request_payload: effectiveInput,
          asset: null,
          attempt_count: 0,
          error_code: null,
          error_message: null,
          completed_at: null,
        }));
      } else {
        rows.push(existing);
      }
      continue;
    }

    const payload = {
      owner_id: ownerId,
      draft_id: effectiveInput.draftId,
      plan_item_id: effectiveInput.planItemId,
      visual_hash: visualHash,
      required_mode: effectiveInput.requiredMode,
      status: "queued" as JobStatus,
      request_payload: effectiveInput,
      asset: null,
      attempt_count: 0,
      max_attempts: 2,
      error_code: null,
      error_message: null,
      worker_id: null,
      started_at: null,
      heartbeat_at: null,
      completed_at: null,
    };
    const { data, error } = await admin.from(TABLE).upsert(payload, {
      onConflict: "owner_id,draft_id,plan_item_id",
    }).select("*").single();
    if (error || !data) throw new Error(`تعذر حفظ مهمة الصورة: ${error?.message ?? "لا توجد بيانات"}`);
    rows.push(data as JobRow);
  }
  return rows;
}

async function listJobs(ownerId: string, draftId: string): Promise<JobRow[]> {
  const { data, error } = await admin.from(TABLE)
    .select("*")
    .eq("owner_id", ownerId)
    .eq("draft_id", draftId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`تعذر قراءة مهام الصور: ${error.message}`);
  return (data ?? []) as JobRow[];
}

async function findJob(ownerId: string, draftId: string, planItemId: string): Promise<JobRow | null> {
  const { data, error } = await admin.from(TABLE)
    .select("*")
    .eq("owner_id", ownerId)
    .eq("draft_id", draftId)
    .eq("plan_item_id", planItemId)
    .maybeSingle();
  if (error) throw new Error(`تعذر قراءة مهمة الصورة: ${error.message}`);
  return data as JobRow | null;
}

async function recoverStaleJobs(ownerId: string, draftId: string): Promise<void> {
  const staleBefore = new Date(Date.now() - STALE_JOB_MS).toISOString();
  const { error } = await admin.from(TABLE).update({
    status: "retry_pending",
    error_code: "STALE_WORKER_RECOVERED",
    error_message: "انقطع عامل توليد الصورة؛ أعاد واثق المهمة تلقائيًا إلى طابور التنفيذ.",
    worker_id: null,
    heartbeat_at: null,
  }).eq("owner_id", ownerId)
    .eq("draft_id", draftId)
    .in("status", ["generating", "validating"])
    .lt("updated_at", staleBefore);
  if (error) throw new Error(`تعذر استعادة مهام الصور المتوقفة: ${error.message}`);
}

async function resetJobForRetry(ownerId: string, jobId: string): Promise<JobRow> {
  const { data, error } = await admin.from(TABLE)
    .select("*")
    .eq("id", jobId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error || !data) throw new Error(`تعذر قراءة مهمة الصورة: ${error?.message ?? "المهمة غير موجودة"}`);
  const row = data as JobRow;
  const previousAssetPath = row.asset?.assetPath ?? row.request_payload.previousAssetPath ?? "";
  return updateJob(jobId, ownerId, {
    status: "retry_pending",
    request_payload: { ...row.request_payload, previousAssetPath },
    asset: null,
    attempt_count: 0,
    error_code: null,
    error_message: null,
    worker_id: null,
    started_at: null,
    heartbeat_at: null,
    completed_at: null,
  });
}

async function cancelJob(ownerId: string, jobId: string): Promise<JobRow> {
  return updateJob(jobId, ownerId, {
    status: "cancelled",
    error_code: "CANCELLED_BY_USER",
    error_message: "ألغى المستخدم مهمة الصورة.",
    worker_id: null,
    completed_at: new Date().toISOString(),
  });
}

async function updateJob(jobId: string, ownerId: string, patch: Record<string, unknown>): Promise<JobRow> {
  const { data, error } = await admin.from(TABLE).update(patch)
    .eq("id", jobId)
    .eq("owner_id", ownerId)
    .select("*")
    .single();
  if (error || !data) throw new Error(`تعذر تحديث مهمة الصورة: ${error?.message ?? "المهمة غير موجودة"}`);
  return data as JobRow;
}

function scheduleRows(rows: JobRow[], accessToken: string, requestId: string): void {
  const pending = rows.filter((row) => row.status === "queued" || row.status === "retry_pending");
  for (const row of pending) scheduleBackground(processJob(row.id, accessToken, requestId));
}

function scheduleBackground(promise: Promise<unknown>): void {
  const runtime = globalThis as unknown as RuntimeWithBackgroundTasks;
  if (runtime.EdgeRuntime?.waitUntil) runtime.EdgeRuntime.waitUntil(promise);
  else void promise;
}

async function processJob(jobId: string, accessToken: string, requestId: string): Promise<void> {
  const workerId = crypto.randomUUID();
  let row: JobRow | null = null;
  try {
    const { data: current, error: currentError } = await admin.from(TABLE).select("*").eq("id", jobId).maybeSingle();
    if (currentError || !current) return;
    row = current as JobRow;
    if (row.status !== "queued" && row.status !== "retry_pending") return;
    if (textField(row.request_payload.visual.type) !== "context_scene") {
      await admin.from(TABLE).update({
        status: "cancelled",
        error_code: "STRUCTURED_VISUAL_RENDERED_LOCALLY",
        error_message: "هذا مخطط علمي منظم ويُرسم داخل واثق من بياناته دون إرسال إلى نموذج الصور.",
        worker_id: null,
        completed_at: new Date().toISOString(),
      }).eq("id", row.id);
      return;
    }
    if (row.attempt_count >= row.max_attempts) {
      await admin.from(TABLE).update({
        status: "failed",
        error_code: "MAX_ATTEMPTS_REACHED",
        error_message: row.error_message || "استنفدت مهمة الصورة عدد المحاولات المسموح.",
        completed_at: new Date().toISOString(),
      }).eq("id", row.id).eq("status", row.status);
      return;
    }

    const attempt = row.attempt_count + 1;
    const now = new Date().toISOString();
    const { data: claimed, error: claimError } = await admin.from(TABLE).update({
      status: "generating",
      attempt_count: attempt,
      worker_id: workerId,
      started_at: row.started_at ?? now,
      heartbeat_at: now,
      error_code: null,
      error_message: null,
    }).eq("id", row.id)
      .eq("status", row.status)
      .select("*")
      .maybeSingle();
    if (claimError || !claimed) return;
    row = claimed as JobRow;

    console.log(JSON.stringify({ event: "wathiq_visual_job_started", requestId, jobId, attempt }));
    const response = await invokeGenerator({ ...row.request_payload, requiredMode: "replace" }, accessToken, row.id);
    if (response.status === "ready" && response.illustration) {
      if (response.illustration.renderMode !== "replace") {
        throw httpError("عاد مولد الصور بنمط عرض قديم غير مدعوم.", 502);
      }
      const completedAt = new Date().toISOString();
      const { data: completed, error: completionError } = await admin.from(TABLE).update({
        status: "ready",
        asset: response.illustration,
        error_code: null,
        error_message: null,
        heartbeat_at: completedAt,
        completed_at: completedAt,
        worker_id: null,
      }).eq("id", row.id).eq("worker_id", workerId).select("id").maybeSingle();
      if (completionError || !completed) {
        await admin.storage.from(QUESTION_VISUAL_BUCKET).remove([response.illustration.assetPath]);
        if (completionError) throw new Error(`تعذر ربط الصورة بالمفردة: ${completionError.message}`);
        console.log(JSON.stringify({ event: "wathiq_visual_job_superseded", requestId, jobId, attempt }));
        return;
      }
      console.log(JSON.stringify({ event: "wathiq_visual_job_ready", requestId, jobId, attempt }));
      return;
    }

    await handleRetryOrFailure(row, workerId, "VISUAL_VALIDATION_FAILED", response.reason || "لم تجتز الصورة التدقيق العلمي.", accessToken, requestId);
  } catch (error) {
    if (!row) return;
    await handleRetryOrFailure(row, workerId, errorCode(error), errorMessage(error), accessToken, requestId);
  }
}

async function handleRetryOrFailure(
  row: JobRow,
  workerId: string,
  code: string,
  message: string,
  accessToken: string,
  requestId: string,
): Promise<void> {
  const shouldRetry = row.attempt_count < row.max_attempts;
  const status: JobStatus = shouldRetry ? "retry_pending" : "failed";
  const completedAt = shouldRetry ? null : new Date().toISOString();
  const { data } = await admin.from(TABLE).update({
    status,
    error_code: code,
    error_message: message.slice(0, 500),
    worker_id: null,
    heartbeat_at: new Date().toISOString(),
    completed_at: completedAt,
  }).eq("id", row.id).eq("worker_id", workerId).select("*").maybeSingle();
  if (shouldRetry && data) {
    await delay(1_500);
    scheduleBackground(processJob(row.id, accessToken, requestId));
  }
}

async function invokeGenerator(
  input: VisualJobInput,
  accessToken: string,
  jobId: string,
): Promise<{ status: "ready" | "failed"; illustration?: VisualAsset; reason: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INTERNAL_GENERATION_TIMEOUT_MS);
  try {
    await admin.from(TABLE).update({
      status: "validating",
      heartbeat_at: new Date().toISOString(),
    }).eq("id", jobId).eq("status", "generating");

    const response = await fetch(GENERATION_ENDPOINT, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "generate_visual_illustration",
        draftId: input.draftId,
        planItemId: input.planItemId,
        programmeId: input.programmeId,
        syllabusCode: input.syllabusCode,
        stageLabel: input.stageLabel,
        subject: input.subject,
        lessonLabel: input.lessonLabel,
        questionText: input.questionText,
        reviewSupport: input.reviewSupport,
        ...(input.previousAssetPath ? { previousAssetPath: input.previousAssetPath } : {}),
        visual: input.visual,
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: Record<string, unknown> = {};
    if (text) {
      try { payload = requireRecord(JSON.parse(text), "استجابة مولد الصور غير صالحة."); }
      catch { payload = { error: text }; }
    }
    if (!response.ok) throw httpError(errorMessage(payload) || `تعذر تشغيل مولد الصور (${response.status}).`, response.status);
    const status = payload.status === "ready" ? "ready" : "failed";
    const illustration = parseVisualAsset(payload.illustration);
    const reason = typeof payload.reason === "string" ? payload.reason : "";
    return { status, ...(illustration ? { illustration } : {}), reason };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw httpError("تجاوز توليد الصورة المدة القصوى للخدمة الخلفية.", 504);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}


function isContextSceneJobInput(value: unknown): boolean {
  const record = asRecord(value);
  const visual = record ? asRecord(record.visual) : null;
  return textField(visual?.type) === "context_scene";
}

function parseJobInput(value: unknown, draftId: string): VisualJobInput {
  const record = requireRecord(value, "إحدى مهام الصور غير صالحة.");
  const visual = requireRecord(record.visual, "مواصفة الرسم غير صالحة.");
  if (textField(visual.type) !== "context_scene") throw httpError("المخططات العلمية المنظمة لا تنشئ مهام صور.", 409);
  const requiredMode = record.requiredMode === "replace" ? "replace" : null;
  if (!requiredMode) throw httpError("نمط الأصل البصري غير صالح.", 400);
  return {
    draftId,
    planItemId: requireText(record.planItemId, "معرف المفردة غير صالح.", 120),
    programmeId: requireProgrammeId(record.programmeId),
    syllabusCode: requireText(record.syllabusCode, "رمز منهج كامبريدج غير محدد.", 20),
    stageLabel: requireText(record.stageLabel, "مرحلة كامبريدج غير محددة.", 120),
    subject: requireText(record.subject, "المادة غير محددة.", 100),
    lessonLabel: requireText(record.lessonLabel, "الدرس غير محدد.", 180),
    questionText: requireText(record.questionText, "نص السؤال غير محدد.", 1_500),
    reviewSupport: requireText(record.reviewSupport, "سياق المراجعة غير محدد.", 3_000),
    previousAssetPath: typeof record.previousAssetPath === "string" ? record.previousAssetPath.trim().slice(0, 300) : "",
    requiredMode,
    visual,
  };
}

function parseVisualAsset(value: unknown): VisualAsset | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  if (typeof record.url !== "string" || !record.url.startsWith("https://")
    || typeof record.assetPath !== "string" || !record.assetPath
    || typeof record.mimeType !== "string" || !record.mimeType.startsWith("image/")
    || typeof record.model !== "string" || !record.model
    || typeof record.generatedAt !== "string" || !record.generatedAt
    || typeof record.promptVersion !== "string" || !record.promptVersion
    || record.validated !== true) return undefined;
  const renderMode: RequiredMode = "replace";
  const assetKind = "scene_2d" as const;
  return {
    url: record.url,
    assetPath: record.assetPath,
    mimeType: record.mimeType,
    model: record.model,
    generatedAt: record.generatedAt,
    promptVersion: record.promptVersion,
    validated: true,
    assetKind,
    renderMode,
  };
}

function toSnapshot(row: JobRow): Record<string, unknown> {
  return {
    id: row.id,
    draftId: row.draft_id,
    planItemId: row.plan_item_id,
    visualHash: row.visual_hash,
    requiredMode: "replace",
    status: row.status,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    errorCode: row.error_code ?? "",
    errorMessage: row.error_message ?? "",
    ...(row.asset ? { asset: row.asset } : {}),
    startedAt: row.started_at ?? "",
    completedAt: row.completed_at ?? "",
    updatedAt: row.updated_at,
  };
}

async function hashInput(input: VisualJobInput): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify({
    planItemId: input.planItemId,
    programmeId: input.programmeId,
    syllabusCode: input.syllabusCode,
    stageLabel: input.stageLabel,
    subject: input.subject,
    lessonLabel: input.lessonLabel,
    questionText: input.questionText,
    reviewSupport: input.reviewSupport,
    requiredMode: input.requiredMode,
    visual: input.visual,
  }));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function requireProgrammeId(value: unknown): "primary" | "lower_secondary" | "igcse" {
  if (value === "primary" || value === "lower_secondary" || value === "igcse") return value;
  throw httpError("برنامج كامبريدج غير صالح.", 400);
}

async function requireUser(req: Request): Promise<{ userId: string; accessToken: string }> {
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw httpError("يلزم تسجيل دخول مالك المنصة.", 401);
  const accessToken = authorization.slice("Bearer ".length);
  const { data, error } = await admin.auth.getUser(accessToken);
  if (error || !data.user) throw httpError("جلسة مالك المنصة غير صالحة أو منتهية.", 401);
  return { userId: data.user.id, accessToken };
}

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("Origin") ?? "";
  const allowedOrigin = origin === appOrigin || origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")
    ? origin
    : appOrigin;
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

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`الإعداد ${name} غير موجود.`);
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
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
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw httpError(message, 400);
  return value;
}

function requireUuid(value: unknown, message: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw httpError(message, 400);
  }
  return value;
}

function textField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function httpError(message: string, status: number): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

function errorStatus(error: unknown): number {
  return typeof error === "object" && error !== null && "status" in error && typeof (error as { status?: unknown }).status === "number"
    ? (error as { status: number }).status
    : 500;
}

function errorCode(error: unknown): string {
  const status = errorStatus(error);
  if (status === 401) return "AUTHENTICATION_FAILED";
  if (status === 408 || status === 504) return "GENERATION_TIMEOUT";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "UPSTREAM_UNAVAILABLE";
  return "VISUAL_GENERATION_FAILED";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  const record = asRecord(error);
  for (const key of ["error", "message", "details", "hint"]) {
    if (typeof record?.[key] === "string" && record[key]) return record[key] as string;
  }
  return "حدث خطأ غير متوقع في منظومة الصور.";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
