import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = requiredEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const WATHIQ_APP_URL = requiredEnv("WATHIQ_APP_URL");
const appOrigin = new URL(WATHIQ_APP_URL).origin;
const RUNS_TABLE = "assessment_generation_runs";
const ITEMS_TABLE = "assessment_generation_items";
const MAX_ITEMS = 40;
const MAX_BODY_BYTES = 600_000;
const HEX_64 = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type RunStatus = "queued" | "running" | "reviewing" | "completed" | "partial" | "failed" | "cancelled" | "superseded";
type ItemStatus = "queued" | "grounding" | "generating" | "normalizing" | "validating" | "ready" | "retry_pending" | "failed" | "cancelled" | "superseded";

interface RunRow {
  id: string;
  owner_id: string;
  draft_id: string;
  generation_epoch: number;
  plan_hash: string;
  source_snapshot_hash: string;
  status: RunStatus;
  total_items: number;
  completed_items: number;
  failed_items: number;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

interface ItemRow {
  id: string;
  run_id: string;
  plan_item_id: string;
  contract_hash: string;
  status: ItemStatus;
  attempt_count: number;
  max_attempts: number;
  error_code: string | null;
  error_message: string | null;
  stage_timings: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "هذه الخدمة تقبل POST فقط." }, 405);

  const requestId = crypto.randomUUID();
  try {
    const auth = await requireUser(req);
    const payload = requireRecord(await readJsonBody(req), "الطلب غير صالح.");
    const action = requireText(payload.action, "نوع العملية غير محدد.", 30);

    if (action === "enqueue") {
      const blueprint = requireRecord(payload.blueprint, "مخطط التوليد غير صالح.");
      const contracts = requireArray(payload.contracts, "عقود مفردات التوليد غير صالحة.");
      await verifyGenerationPayload(blueprint, contracts);
      const rpc = await admin.rpc("enqueue_assessment_generation_run", {
        p_owner_id: auth.userId,
        p_blueprint: blueprint,
        p_contracts: contracts,
      });
      if (rpc.error) throw databaseError("تعذر إنشاء دورة التوليد", rpc.error);
      const entry = Array.isArray(rpc.data) ? asRecord(rpc.data[0]) : asRecord(rpc.data);
      const runId = requireUuid(entry?.run_id, "لم تعد قاعدة البيانات معرف دورة صالحًا.");
      const snapshot = await loadRunSnapshot(auth.userId, runId);
      return json(req, {
        run: snapshot,
        created: entry?.created === true,
        requestId,
      });
    }

    if (action === "list") {
      const draftId = requireText(payload.draftId, "معرف المسودة غير صالح.", 120);
      await recoverStale(auth.userId, draftId);
      const runId = typeof payload.runId === "string" && payload.runId.trim()
        ? requireUuid(payload.runId, "معرف دورة التوليد غير صالح.")
        : await findLatestRunId(auth.userId, draftId);
      const snapshot = runId ? await loadRunSnapshot(auth.userId, runId, draftId) : null;
      return json(req, { run: snapshot, requestId });
    }

    if (action === "retry") {
      const itemId = requireUuid(payload.itemId, "معرف مهمة المفردة غير صالح.");
      const rpc = await admin.rpc("retry_assessment_generation_item", {
        p_owner_id: auth.userId,
        p_item_id: itemId,
      });
      if (rpc.error) throw databaseError("تعذر إعادة مهمة المفردة", rpc.error);
      const runId = requireUuid(rpc.data, "لم تعد قاعدة البيانات معرف دورة صالحًا.");
      return json(req, { run: await loadRunSnapshot(auth.userId, runId), requestId });
    }

    if (action === "cancel") {
      const runId = requireUuid(payload.runId, "معرف دورة التوليد غير صالح.");
      const rpc = await admin.rpc("cancel_assessment_generation_run", {
        p_owner_id: auth.userId,
        p_run_id: runId,
      });
      if (rpc.error) throw databaseError("تعذر إلغاء دورة التوليد", rpc.error);
      if (rpc.data !== true) throw httpError("دورة التوليد غير موجودة أو لا يمكن إلغاؤها.", 404);
      return json(req, { run: await loadRunSnapshot(auth.userId, runId), requestId });
    }

    if (action === "resume") {
      const runId = requireUuid(payload.runId, "معرف دورة التوليد غير صالح.");
      const rpc = await admin.rpc("resume_assessment_generation_run", {
        p_owner_id: auth.userId,
        p_run_id: runId,
      });
      if (rpc.error) throw databaseError("تعذر استئناف دورة التوليد", rpc.error);
      if (rpc.data !== true) throw httpError("دورة التوليد غير موجودة أو أصبحت منتهية.", 404);
      return json(req, { run: await loadRunSnapshot(auth.userId, runId), requestId });
    }

    throw httpError("العملية المطلوبة غير مدعومة.", 404);
  } catch (error) {
    console.error(JSON.stringify({
      event: "wathiq_assessment_generation_jobs_failed",
      requestId,
      message: errorMessage(error),
    }));
    return json(req, { error: errorMessage(error), requestId }, errorStatus(error));
  }
});

async function verifyGenerationPayload(
  blueprint: Record<string, unknown>,
  rawContracts: unknown[],
): Promise<void> {
  assertAllowedFields(blueprint, new Set([
    "engineSchemaVersion", "blueprintVersion", "draftId", "generationEpoch", "assessmentType",
    "assessmentPolicyId", "programmeId", "syllabusCode", "stageLabel", "grade", "subject", "topic", "difficulty", "totalMarks", "itemCount",
    "planHash", "sourceSnapshotHash", "items",
  ]), "مخطط التوليد");
  const draftId = requireText(blueprint.draftId, "معرف المسودة في المخطط غير صالح.", 120);
  const generationEpoch = requireInteger(blueprint.generationEpoch, "إزاحة التوليد غير صالحة.", 1, Number.MAX_SAFE_INTEGER);
  const planHash = requireHash(blueprint.planHash, "بصمة الخطة غير صالحة.");
  const sourceSnapshotHash = requireHash(blueprint.sourceSnapshotHash, "بصمة المصادر غير صالحة.");
  if (blueprint.engineSchemaVersion !== 1 || blueprint.blueprintVersion !== 3) {
    throw httpError("إصدار مخطط التوليد غير مدعوم.", 409);
  }

  const items = requireArray(blueprint.items, "مفردات مخطط التوليد غير صالحة.");
  if (items.length < 1 || items.length > MAX_ITEMS || rawContracts.length !== items.length) {
    throw httpError(`عدد المفردات والعقود يجب أن يتطابق وأن يكون بين 1 و${MAX_ITEMS}.`, 400);
  }
  if (blueprint.itemCount !== items.length) throw httpError("عدد مفردات المخطط غير متسق.", 400);

  const blueprintItems = items.map((value, index) => parseBlueprintItem(value, index + 1));
  const uniquePlanItems = new Set(blueprintItems.map((item) => item.planItemId));
  if (uniquePlanItems.size !== blueprintItems.length) throw httpError("يتضمن المخطط معرف مفردة مكررًا.", 400);
  const totalMarks = blueprintItems.reduce((sum, item) => sum + requireInteger(item.record.marks, "درجة المفردة غير صالحة.", 1, 20), 0);
  if (blueprint.totalMarks !== totalMarks) throw httpError("مجموع درجات المخطط غير متسق.", 400);

  const computedPlanHash = await sha256Hex(blueprintItems.map(({ record }) => {
    const { source: _source, ...withoutSource } = record;
    return withoutSource;
  }));
  if (computedPlanHash !== planHash) throw httpError("بصمة الخطة لا تطابق محتواها.", 409);
  const computedSourceHash = await sha256Hex(blueprintItems.map(({ source }) => source));
  if (computedSourceHash !== sourceSnapshotHash) throw httpError("بصمة المصادر لا تطابق لقطاتها.", 409);

  const blueprintBase = {
    engineSchemaVersion: 1,
    contractVersion: 3,
    draftId,
    generationEpoch,
    planHash,
    assessmentType: requireText(blueprint.assessmentType, "نوع الاختبار غير صالح.", 80),
    assessmentPolicyId: requireText(blueprint.assessmentPolicyId, "سياسة الاختبار غير صالحة.", 160),
    programmeId: requireText(blueprint.programmeId, "برنامج Cambridge غير صالح.", 40),
    syllabusCode: requireText(blueprint.syllabusCode, "رمز منهج Cambridge غير صالح.", 40),
    stageLabel: requireText(blueprint.stageLabel, "مرحلة Cambridge غير صالحة.", 100),
    grade: requireInteger(blueprint.grade, "الصف الدراسي غير صالح.", 1, 12),
    subject: requireText(blueprint.subject, "المادة غير صالحة.", 120),
    topic: requireText(blueprint.topic, "موضوع الاختبار غير صالح.", 240),
    difficulty: requireText(blueprint.difficulty, "مستوى الصعوبة غير صالح.", 80),
  };

  const contracts = rawContracts.map((value) => requireRecord(value, "عقد مفردة غير صالح."));
  const contractPlanItems = new Set<string>();
  for (const contract of contracts) {
    const planItemId = requireText(contract.planItemId, "معرف المفردة في العقد غير صالح.", 120);
    if (contractPlanItems.has(planItemId)) throw httpError("تكرر عقد المفردة نفسها.", 400);
    contractPlanItems.add(planItemId);
    const item = blueprintItems.find((candidate) => candidate.planItemId === planItemId);
    if (!item) throw httpError(`لا توجد المفردة ${planItemId} داخل المخطط.`, 400);

    const expectedBase = {
      ...blueprintBase,
      planItemId: item.record.planItemId,
      order: item.record.order,
      grade: blueprintBase.grade,
      subject: blueprintBase.subject,
      topic: blueprintBase.topic,
      difficulty: blueprintBase.difficulty,
      lessonId: item.record.lessonId,
      lessonLabel: item.record.lessonLabel,
      questionType: item.record.questionType,
      cognitiveLevel: item.record.cognitiveLevel,
      ...(Object.hasOwn(item.record, "difficultyLevel") ? { difficultyLevel: item.record.difficultyLevel } : {}),
      marks: item.record.marks,
      source: item.source,
    };
    const contractHash = requireHash(contract.contractHash, "بصمة عقد المفردة غير صالحة.");
    const { contractHash: _ignored, ...providedBase } = contract;
    if (stableStringify(providedBase) !== stableStringify(expectedBase)) {
      throw httpError(`عقد المفردة ${planItemId} لا يطابق مخططها المملوك للخادم.`, 409);
    }
    if (await sha256Hex(expectedBase) !== contractHash) {
      throw httpError(`بصمة عقد المفردة ${planItemId} غير صحيحة.`, 409);
    }
  }
}

function parseBlueprintItem(value: unknown, expectedOrder: number): {
  planItemId: string;
  record: Record<string, unknown>;
  source: Record<string, unknown>;
} {
  const record = requireRecord(value, "مفردة المخطط غير صالحة.");
  assertAllowedFields(record, new Set([
    "order", "planItemId", "lessonId", "lessonLabel", "questionType",
    "cognitiveLevel", "difficultyLevel", "marks", "source",
  ]), "مفردة المخطط");
  const order = requireInteger(record.order, "ترتيب مفردة المخطط غير صالح.", 1, MAX_ITEMS);
  if (order !== expectedOrder) throw httpError("ترتيب مفردات المخطط غير متصل.", 400);
  const planItemId = requireText(record.planItemId, "معرف مفردة المخطط غير صالح.", 120);
  requireText(record.lessonId, "معرف الدرس غير صالح.", 160);
  requireText(record.lessonLabel, "اسم الدرس غير صالح.", 240);
  requireText(record.questionType, "نوع السؤال غير صالح.", 100);
  requireText(record.cognitiveLevel, "المستوى المعرفي غير صالح.", 100);
  if (Object.hasOwn(record, "difficultyLevel")) requireText(record.difficultyLevel, "صعوبة المفردة غير صالحة.", 100);
  requireInteger(record.marks, "درجة المفردة غير صالحة.", 1, 20);
  const source = requireRecord(record.source, "لقطة مصدر المفردة غير صالحة.");
  const allowedSourceFields = new Set([
    "mode", "sourceId", "sourceTitle", "sourceKind", "sourceReferenceId", "chunkIndex",
    "pageFrom", "pageTo", "contentHash", "extractionVersion",
  ]);
  const unknownSourceFields = Object.keys(source).filter((key) => !allowedSourceFields.has(key));
  if (unknownSourceFields.length) throw httpError("لقطة المصدر تحتوي حقولًا غير مسموحة.", 400);
  const mode = requireText(source.mode, "وضع المصدر غير صالح.", 40);
  if (mode !== "global_curriculum") throw httpError("واثق الحالي يقبل سياق كامبريدج العالمي فقط.", 400);
  requireText(source.sourceId, "معرف المصدر غير صالح.", 180);
  requireText(source.sourceTitle, "عنوان المصدر غير صالح.", 300);
  requireText(source.sourceKind, "نوع المصدر غير صالح.", 100);
  requireText(source.sourceReferenceId, "مرجع المصدر غير صالح.", 240);
  requireInteger(source.chunkIndex, "رقم مقطع المصدر غير صالح.", 0, Number.MAX_SAFE_INTEGER);
  requireInteger(source.pageFrom, "صفحة بداية المصدر غير صالحة.", 1, Number.MAX_SAFE_INTEGER);
  const pageTo = requireInteger(source.pageTo, "صفحة نهاية المصدر غير صالحة.", 1, Number.MAX_SAFE_INTEGER);
  if (pageTo < Number(source.pageFrom)) throw httpError("نطاق صفحات المصدر غير صالح.", 400);
  requireHash(source.contentHash, "بصمة محتوى المصدر غير صالحة.");
  requireText(source.extractionVersion, "إصدار استخراج المصدر غير صالح.", 120);
  return { planItemId, record, source };
}

async function recoverStale(ownerId: string, draftId: string): Promise<void> {
  const rpc = await admin.rpc("recover_stale_assessment_generation_items", {
    p_owner_id: ownerId,
    p_draft_id: draftId,
  });
  if (rpc.error) throw databaseError("تعذر استعادة مهام التوليد المتوقفة", rpc.error);
}

async function findLatestRunId(ownerId: string, draftId: string): Promise<string | null> {
  const { data, error } = await admin.from(RUNS_TABLE)
    .select("id")
    .eq("owner_id", ownerId)
    .eq("draft_id", draftId)
    .order("generation_epoch", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw databaseError("تعذر قراءة أحدث دورة توليد", error);
  return typeof data?.id === "string" ? data.id : null;
}

async function loadRunSnapshot(ownerId: string, runId: string, draftId?: string): Promise<Record<string, unknown>> {
  let runQuery = admin.from(RUNS_TABLE).select("*").eq("id", runId).eq("owner_id", ownerId);
  if (draftId) runQuery = runQuery.eq("draft_id", draftId);
  const { data: runData, error: runError } = await runQuery.maybeSingle();
  if (runError) throw databaseError("تعذر قراءة دورة التوليد", runError);
  if (!runData) throw httpError("دورة التوليد غير موجودة.", 404);
  const run = runData as RunRow;

  const { data: itemsData, error: itemsError } = await admin.from(ITEMS_TABLE)
    .select("id,run_id,plan_item_id,contract_hash,status,attempt_count,max_attempts,error_code,error_message,stage_timings,result,started_at,completed_at,updated_at")
    .eq("run_id", run.id)
    .eq("owner_id", ownerId)
    .order("item_order", { ascending: true });
  if (itemsError) throw databaseError("تعذر قراءة مهام مفردات التوليد", itemsError);
  const items = (itemsData ?? []) as ItemRow[];
  return toRunSnapshot(run, items);
}

function toRunSnapshot(run: RunRow, items: ItemRow[]): Record<string, unknown> {
  return {
    id: run.id,
    draftId: run.draft_id,
    generationEpoch: run.generation_epoch,
    planHash: run.plan_hash,
    sourceSnapshotHash: run.source_snapshot_hash,
    status: run.status,
    totalItems: run.total_items,
    completedItems: run.completed_items,
    failedItems: run.failed_items,
    items: items.map((item) => ({
      id: item.id,
      runId: item.run_id,
      planItemId: item.plan_item_id,
      contractHash: item.contract_hash,
      status: item.status,
      attemptCount: item.attempt_count,
      maxAttempts: item.max_attempts,
      errorCode: item.error_code ?? "",
      errorMessage: item.error_message ?? "",
      stageTimings: normalizeStageTimings(item.stage_timings),
      ...(item.result ? { result: item.result } : {}),
      startedAt: item.started_at ?? "",
      completedAt: item.completed_at ?? "",
      updatedAt: item.updated_at,
    })),
    startedAt: run.started_at ?? "",
    completedAt: run.completed_at ?? "",
    updatedAt: run.updated_at,
  };
}

function normalizeStageTimings(value: Record<string, unknown> | null): Record<string, number> {
  const record = value ?? {};
  return {
    groundingMs: finiteNonNegative(record.groundingMs),
    modelMs: finiteNonNegative(record.modelMs),
    normalizationMs: finiteNonNegative(record.normalizationMs),
    validationMs: finiteNonNegative(record.validationMs),
    totalMs: finiteNonNegative(record.totalMs),
  };
}

function finiteNonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

async function readJsonBody(req: Request): Promise<unknown> {
  const declaredLength = Number(req.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw httpError("حجم طلب التوليد تجاوز الحد المسموح.", 413);
  }
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw httpError("حجم طلب التوليد تجاوز الحد المسموح.", 413);
  }
  try { return JSON.parse(text) as unknown; }
  catch { throw httpError("تعذر قراءة طلب التوليد بصيغة JSON.", 400); }
}

async function requireUser(req: Request): Promise<{ userId: string }> {
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw httpError("يلزم تسجيل الدخول إلى واثق.", 401);
  const accessToken = authorization.slice("Bearer ".length);
  const { data, error } = await admin.auth.getUser(accessToken);
  if (error || !data.user) throw httpError("جلسة المستخدم غير صالحة أو منتهية.", 401);
  return { userId: data.user.id };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForStableJson(value, new WeakSet<object>()));
}

function normalizeForStableJson(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") return null;
  if (Array.isArray(value)) return value.map((entry) => normalizeForStableJson(entry, seen));
  if (typeof value === "object") {
    if (seen.has(value)) throw httpError("لا يمكن حساب بصمة لطلب دائري.", 400);
    seen.add(value);
    const record = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const entry = record[key];
      if (typeof entry === "undefined" || typeof entry === "function" || typeof entry === "symbol") continue;
      normalized[key] = normalizeForStableJson(entry, seen);
    }
    seen.delete(value);
    return normalized;
  }
  return null;
}

async function sha256Hex(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  const record = asRecord(value);
  if (!record) throw httpError(message, 400);
  return record;
}


function assertAllowedFields(record: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  const unknown = Object.keys(record).filter((key) => !allowed.has(key));
  if (unknown.length) throw httpError(`${label} يحتوي حقولًا غير مسموحة: ${unknown.join(", ")}.`, 400);
}

function requireArray(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) throw httpError(message, 400);
  return value;
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

function requireHash(value: unknown, message: string): string {
  if (typeof value !== "string" || !HEX_64.test(value.toLowerCase())) throw httpError(message, 400);
  return value.toLowerCase();
}

function requireUuid(value: unknown, message: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw httpError(message, 400);
  return value;
}

function databaseError(prefix: string, error: { message?: string; code?: string; details?: string; hint?: string }): Error & { status: number } {
  const message = [error.message, error.details, error.hint].find((value) => typeof value === "string" && value) ?? "خطأ قاعدة بيانات غير محدد.";
  const status = error.code === "23505" || /CONFLICT|STALE/u.test(message) ? 409 : 500;
  return httpError(`${prefix}: ${message}`, status);
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

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  const record = asRecord(error);
  for (const key of ["error", "message", "details", "hint"]) {
    if (typeof record?.[key] === "string" && record[key]) return record[key] as string;
  }
  return "حدث خطأ غير متوقع في منظومة توليد الاختبارات.";
}
