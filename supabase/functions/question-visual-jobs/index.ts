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
const GENERATION_STAGE_TIMEOUT_MS = 90_000;
const REVIEW_STAGE_TIMEOUT_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const WORKER_LEASE_TIMEOUT_MS = 45_000;
const MAX_STAGE_ATTEMPTS = 2;
const MAX_APPARENT_ATTEMPTS = 8;
const SERVER_DRIVEN_TRANSIENT_RETRY_DELAY_MS = 1_000;
const WORKER_LOST_LEASE_OR_SUPERSEDED_ERROR = "WORKER_LOST_LEASE_OR_SUPERSEDED";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type JobStatus = "queued" | "generating" | "validating" | "ready" | "retry_pending" | "failed" | "cancelled";
type RequiredMode = "replace";
type WorkflowStage = "generate_original" | "review_original" | "generate_corrected" | "review_corrected" | "ready" | "failed";

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

interface VisualAsset extends ProvisionalVisualAsset {
  validated: true;
}

interface WorkflowState {
  version: 1;
  stage: WorkflowStage;
  originalAssetPath: string | null;
  correctedAssetPath: string | null;
  provisionalOriginal: ProvisionalVisualAsset | null;
  provisionalCorrected: ProvisionalVisualAsset | null;
  correction: string;
  generationAttempts: { original: number; corrected: number };
  reviewAttempts: { original: number; corrected: number };
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
  workflow_state: WorkflowState | null;
  attempt_count: number;
  max_attempts: number;
  error_code: string | null;
  error_message: string | null;
  worker_id: string | null;
  started_at: string | null;
  heartbeat_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface RuntimeWithBackgroundTasks {
  EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void };
}

type StageResult =
  | { kind: "generated"; asset: ProvisionalVisualAsset }
  | { kind: "approved"; reason: string }
  | { kind: "scientific_rejection"; correction: string; reason: string }
  | { kind: "transient_error"; code: string; message: string }
  | { kind: "terminal_error"; code: string; message: string };

const DEFAULT_WORKFLOW_STATE: WorkflowState = {
  version: 1,
  stage: "generate_original",
  originalAssetPath: null,
  correctedAssetPath: null,
  provisionalOriginal: null,
  provisionalCorrected: null,
  correction: "",
  generationAttempts: { original: 0, corrected: 0 },
  reviewAttempts: { original: 0, corrected: 0 },
};

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
          workflow_state: freshWorkflowState(),
          attempt_count: 0,
          max_attempts: 2,
          error_code: null,
          error_message: null,
          worker_id: null,
          started_at: null,
          heartbeat_at: null,
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
      workflow_state: freshWorkflowState(),
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
    if (existing && existing.visual_hash !== visualHash) {
      await cleanupKnownProvisionalAssets(ownerId, workflowStateOf(existing), []);
    }
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
  const leaseBefore = new Date(Date.now() - WORKER_LEASE_TIMEOUT_MS).toISOString();
  const { error: leaseRecoveryError } = await admin.from(TABLE).update({
    status: "retry_pending",
    error_code: "STALE_WORKER_RECOVERED",
    error_message: "انقطع عامل الصورة؛ أعاد واثق المرحلة نفسها إلى طابور التنفيذ.",
    worker_id: null,
    heartbeat_at: null,
  })
    .eq("owner_id", ownerId)
    .eq("draft_id", draftId)
    .in("status", ["generating", "validating"])
    .not("worker_id", "is", null)
    .or(`heartbeat_at.is.null,heartbeat_at.lt.${leaseBefore}`);
  if (leaseRecoveryError) throw new Error(`تعذر استعادة مهام الصور المتقطعة: ${leaseRecoveryError.message}`);

  const staleBefore = new Date(Date.now() - STALE_JOB_MS).toISOString();
  const { error: fallbackRecoveryError } = await admin.from(TABLE).update({
    status: "retry_pending",
    error_code: "STALE_WORKER_RECOVERED",
    error_message: "انقطع عامل الصورة؛ أعاد واثق المرحلة نفسها إلى طابور التنفيذ.",
    worker_id: null,
    heartbeat_at: null,
  })
    .eq("owner_id", ownerId)
    .eq("draft_id", draftId)
    .in("status", ["generating", "validating"])
    .lt("updated_at", staleBefore);
  if (fallbackRecoveryError) throw new Error(`تعذر استعادة مهام الصور المتقطعة: ${fallbackRecoveryError.message}`);
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
    workflow_state: freshWorkflowState(),
    attempt_count: 0,
    max_attempts: 2,
    error_code: null,
    error_message: null,
    worker_id: null,
    started_at: null,
    heartbeat_at: null,
    completed_at: null,
  });
}

async function cancelJob(ownerId: string, jobId: string): Promise<JobRow> {
  const existing = await findJobById(ownerId, jobId);
  const state = workflowStateOf(existing);
  const row = await updateJob(jobId, ownerId, {
    status: "cancelled",
    error_code: "CANCELLED_BY_USER",
    error_message: "ألغى المستخدم مهمة الصورة.",
    worker_id: null,
    completed_at: new Date().toISOString(),
  });
  await cleanupKnownProvisionalAssets(existing.owner_id, state, []);
  return row;
}

async function findJobById(ownerId: string, jobId: string): Promise<JobRow> {
  const { data, error } = await admin.from(TABLE).select("*")
    .eq("id", jobId).eq("owner_id", ownerId).maybeSingle();
  if (error || !data) throw new Error(`تعذر قراءة مهمة الصورة: ${error?.message ?? "المهمة غير موجودة"}`);
  return data as JobRow;
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

async function continueServerDrivenWorkflow(
  jobId: string,
  accessToken: string,
  requestId: string,
  result: StageResult,
): Promise<void> {
  if (result.kind === "approved" || result.kind === "terminal_error") return;
  if (result.kind === "transient_error") await delay(SERVER_DRIVEN_TRANSIENT_RETRY_DELAY_MS);

  const { data, error } = await admin.from(TABLE).select("*").eq("id", jobId).maybeSingle();
  if (error || !data) return;

  const row = data as JobRow;
  if (row.status !== "retry_pending") return;

  const state = workflowStateOf(row);
  if (state.stage === "ready" || state.stage === "failed") return;

  console.log(JSON.stringify({
    event: "wathiq_visual_job_continuing",
    requestId,
    jobId,
    stage: state.stage,
    stageAttempt: stageAttempts(state) + 1,
  }));

  await processJob(jobId, accessToken, requestId);
}

async function processJob(jobId: string, accessToken: string, requestId: string): Promise<void> {
  const workerId = crypto.randomUUID();
  let claimedRow: JobRow | null = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  try {
    const { data: current, error: currentError } = await admin.from(TABLE).select("*").eq("id", jobId).maybeSingle();
    if (currentError || !current) return;
    const row = current as JobRow;
    if (row.status !== "queued" && row.status !== "retry_pending") return;

    if (textField(row.request_payload.visual.type) !== "context_scene") {
      await admin.from(TABLE).update({
        status: "cancelled",
        error_code: "STRUCTURED_VISUAL_RENDERED_LOCALLY",
        error_message: "هذا مخطط علمي منظم ويُرسم داخل واثق من بياناته دون إرسال إلى نموذج الصور.",
        worker_id: null,
        completed_at: new Date().toISOString(),
      }).eq("id", row.id).eq("status", row.status);
      return;
    }

    const state = workflowStateOf(row);
    if (state.stage === "ready" || state.stage === "failed") return;

    if (stageAttempts(state) >= MAX_STAGE_ATTEMPTS) {
      await failWithoutClaim(row, state, "MAX_STAGE_ATTEMPTS_REACHED", "استنفدت المرحلة الحالية عدد المحاولات المسموح.");
      return;
    }

    const claimedState = incrementStageAttempt(state);
    const now = new Date().toISOString();
    const claimedStatus: JobStatus = isReviewStage(state.stage) ? "validating" : "generating";
    const { data: claimed, error: claimError } = await admin.from(TABLE).update({
      status: claimedStatus,
      workflow_state: claimedState,
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
    claimedRow = claimed as JobRow;

    console.log(JSON.stringify({
      event: "wathiq_visual_job_stage_started",
      requestId,
      jobId,
      stage: claimedState.stage,
      stageAttempt: stageAttempts(claimedState),
    }));

    let inFlight = false;
    heartbeatInterval = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const { data: heartbeatData, error: heartbeatError } = await admin.from(TABLE).update({
          heartbeat_at: new Date().toISOString(),
        }).eq("id", jobId).eq("worker_id", workerId).select("id").maybeSingle();
        if (heartbeatError) {
          console.warn("Heartbeat update error:", heartbeatError);
        } else if (!heartbeatData && heartbeatInterval !== null) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
      } catch (error) {
        console.warn("Heartbeat update catch error:", error);
      } finally {
        inFlight = false;
      }
    }, HEARTBEAT_INTERVAL_MS);

    const result = await invokeStage(claimedRow, claimedState, accessToken);

    if (heartbeatInterval !== null) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }

    await applyStageResult(claimedRow, claimedState, workerId, result, requestId);
    await continueServerDrivenWorkflow(jobId, accessToken, requestId, result);
  } catch (error) {
    if (heartbeatInterval !== null) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (!claimedRow) return;
    if (isWorkerLostLeaseOrSupersededError(error)) {
      console.log(JSON.stringify({ event: "wathiq_visual_job_superseded", requestId, jobId }));
      return;
    }
    const state = workflowStateOf(claimedRow);
    const result: StageResult = isTransientStatus(errorStatus(error))
      ? { kind: "transient_error", code: errorCode(error), message: errorMessage(error) }
      : { kind: "terminal_error", code: errorCode(error), message: errorMessage(error) };
    await applyStageResult(claimedRow, state, workerId, result, requestId);
    await continueServerDrivenWorkflow(jobId, accessToken, requestId, result);
  } finally {
    if (heartbeatInterval !== null) clearInterval(heartbeatInterval);
  }
}

async function invokeStage(row: JobRow, state: WorkflowState, accessToken: string): Promise<StageResult> {
  const action = isReviewStage(state.stage) ? "review_image" : "generate_image";
  const timeoutMs = isReviewStage(state.stage) ? REVIEW_STAGE_TIMEOUT_MS : GENERATION_STAGE_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body: Record<string, unknown> = {
      action,
      draftId: row.request_payload.draftId,
      planItemId: row.request_payload.planItemId,
      programmeId: row.request_payload.programmeId,
      syllabusCode: row.request_payload.syllabusCode,
      stageLabel: row.request_payload.stageLabel,
      subject: row.request_payload.subject,
      lessonLabel: row.request_payload.lessonLabel,
      questionText: row.request_payload.questionText,
      reviewSupport: row.request_payload.reviewSupport,
      visual: row.request_payload.visual,
    };

    if (state.stage === "generate_original") body.correction = "";
    if (state.stage === "generate_corrected") body.correction = state.correction;
    if (state.stage === "review_original") body.assetPath = requireWorkflowPath(state.provisionalOriginal, "الأصل الأولي غير موجود للمراجعة.");
    if (state.stage === "review_corrected") body.assetPath = requireWorkflowPath(state.provisionalCorrected, "الأصل المصحح غير موجود للمراجعة.");

    const response = await fetch(GENERATION_ENDPOINT, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const rawText = await response.text();
    let payload: Record<string, unknown> = {};
    if (rawText) {
      try { payload = requireRecord(JSON.parse(rawText), "استجابة خدمة الصور غير صالحة."); }
      catch { payload = { error: rawText }; }
    }

    if (!response.ok) {
      const message = errorMessage(payload) || `تعذر تشغيل خدمة الصور (${response.status}).`;
      if (isTransientStatus(response.status)) return { kind: "transient_error", code: errorCodeFromStatus(response.status), message };
      return { kind: "terminal_error", code: errorCodeFromStatus(response.status), message };
    }

    if (payload.status === "generated") {
      const asset = parseProvisionalVisualAsset(payload.asset);
      if (!asset) return { kind: "transient_error", code: "INVALID_STAGE_RESPONSE", message: "أعادت خدمة الصور أصلاً مؤقتاً غير صالح." };
      return { kind: "generated", asset };
    }
    if (payload.status === "approved") {
      return { kind: "approved", reason: textField(payload.reason) };
    }
    if (payload.status === "scientific_rejection") {
      const correction = textField(payload.correction);
      const reason = textField(payload.reason) || "لم يجتز الأصل الفحص العلمي.";
      if (!correction) return { kind: "transient_error", code: "INVALID_REVIEW_RESPONSE", message: "لم يُرجع المراجع العلمي تعليمات التصحيح المطلوبة." };
      return { kind: "scientific_rejection", correction, reason };
    }
    return { kind: "transient_error", code: "INVALID_STAGE_RESPONSE", message: "استجابة خدمة الصور لا تطابق عقد المرحلة." };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { kind: "transient_error", code: "STAGE_TIMEOUT", message: "تجاوزت مرحلة الصورة المدة القصوى المسموح بها." };
    }
    if (isTransientStatus(errorStatus(error))) {
      return { kind: "transient_error", code: errorCode(error), message: errorMessage(error) };
    }
    return { kind: "terminal_error", code: errorCode(error), message: errorMessage(error) };
  } finally {
    clearTimeout(timeout);
  }
}

async function applyStageResult(
  row: JobRow,
  state: WorkflowState,
  workerId: string,
  result: StageResult,
  requestId: string,
): Promise<void> {
  if (result.kind === "generated") {
    const next = cloneWorkflowState(state);
    if (state.stage === "generate_original") {
      next.provisionalOriginal = result.asset;
      next.originalAssetPath = result.asset.assetPath;
      next.stage = "review_original";
    } else if (state.stage === "generate_corrected") {
      next.provisionalCorrected = result.asset;
      next.correctedAssetPath = result.asset.assetPath;
      next.stage = "review_corrected";
    } else {
      await terminalFailure(row, state, workerId, "INVALID_STAGE_TRANSITION", "وصل أصل مولد إلى مرحلة لا تقبل التوليد.");
      return;
    }
    const transitioned = await fencedStageUpdate(row.id, workerId, {
      status: "retry_pending",
      workflow_state: next,
      worker_id: null,
      heartbeat_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
      completed_at: null,
    });
    if (!transitioned) {
      await removeOwnedPaths(row.owner_id, [result.asset.assetPath]);
    }
    return;
  }

  if (result.kind === "approved") {
    const provisional = state.stage === "review_original" ? state.provisionalOriginal
      : state.stage === "review_corrected" ? state.provisionalCorrected : null;
    if (!provisional) {
      await terminalFailure(row, state, workerId, "MISSING_APPROVED_ASSET", "تعذر العثور على الأصل الذي اجتاز المراجعة.");
      return;
    }
    const finalAsset: VisualAsset = { ...provisional, validated: true };
    const finalState = cloneWorkflowState(state);
    finalState.stage = "ready";
    const completedAt = new Date().toISOString();
    const updated = await fencedStageUpdate(row.id, workerId, {
      status: "ready",
      asset: finalAsset,
      workflow_state: finalState,
      error_code: null,
      error_message: null,
      worker_id: null,
      heartbeat_at: completedAt,
      completed_at: completedAt,
    });
    if (!updated) return;

    const cleanup: string[] = [];
    if (state.stage === "review_corrected" && state.provisionalOriginal?.assetPath) cleanup.push(state.provisionalOriginal.assetPath);
    if (row.request_payload.previousAssetPath && row.request_payload.previousAssetPath !== finalAsset.assetPath) cleanup.push(row.request_payload.previousAssetPath);
    await cleanupKnownProvisionalAssets(row.owner_id, state, cleanup, finalAsset.assetPath);
    console.log(JSON.stringify({ event: "wathiq_visual_job_ready", requestId, jobId: row.id, stage: state.stage }));
    return;
  }

  if (result.kind === "scientific_rejection") {
    if (state.stage === "review_original") {
      const next = cloneWorkflowState(state);
      next.correction = result.correction.slice(0, 900);
      next.stage = "generate_corrected";
      await fencedStageUpdate(row.id, workerId, {
        status: "retry_pending",
        workflow_state: next,
        error_code: null,
        error_message: result.reason.slice(0, 500),
        worker_id: null,
        heartbeat_at: new Date().toISOString(),
        completed_at: null,
      });
      return;
    }
    await terminalFailure(row, state, workerId, "SCIENTIFIC_REJECTION", result.reason);
    return;
  }

  if (result.kind === "transient_error") {
    const consumed = stageAttempts(state);
    if (consumed >= MAX_STAGE_ATTEMPTS) {
      await terminalFailure(row, state, workerId, result.code, result.message);
      return;
    }
    await fencedStageUpdate(row.id, workerId, {
      status: "retry_pending",
      workflow_state: state,
      error_code: result.code,
      error_message: result.message.slice(0, 500),
      worker_id: null,
      heartbeat_at: new Date().toISOString(),
      completed_at: null,
    });
    return;
  }

  await terminalFailure(row, state, workerId, result.code, result.message);
}

async function terminalFailure(row: JobRow, state: WorkflowState, workerId: string, code: string, message: string): Promise<void> {
  const failedState = cloneWorkflowState(state);
  failedState.stage = "failed";
  const completedAt = new Date().toISOString();
  const updated = await fencedStageUpdate(row.id, workerId, {
    status: "failed",
    asset: null,
    workflow_state: failedState,
    error_code: code,
    error_message: message.slice(0, 500),
    worker_id: null,
    heartbeat_at: completedAt,
    completed_at: completedAt,
  });
  if (!updated) return;
  await cleanupKnownProvisionalAssets(row.owner_id, state, []);
}

async function failWithoutClaim(row: JobRow, state: WorkflowState, code: string, message: string): Promise<void> {
  const failedState = cloneWorkflowState(state);
  failedState.stage = "failed";
  const completedAt = new Date().toISOString();
  const { data } = await admin.from(TABLE).update({
    status: "failed",
    asset: null,
    workflow_state: failedState,
    error_code: code,
    error_message: message.slice(0, 500),
    worker_id: null,
    heartbeat_at: completedAt,
    completed_at: completedAt,
  }).eq("id", row.id).eq("status", row.status).select("id").maybeSingle();
  if (data) await cleanupKnownProvisionalAssets(row.owner_id, state, []);
}

async function fencedStageUpdate(jobId: string, workerId: string, patch: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await admin.from(TABLE).update(patch)
    .eq("id", jobId)
    .eq("worker_id", workerId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`تعذر تحديث مرحلة الصورة: ${error.message}`);
  return Boolean(data);
}

async function cleanupKnownProvisionalAssets(
  ownerId: string,
  state: WorkflowState,
  extraPaths: string[],
  keepPath = "",
): Promise<void> {
  const ownerPrefix = `${storageSegment(ownerId)}/`;
  const candidates = new Set<string>([
    state.provisionalOriginal?.assetPath ?? "",
    state.provisionalCorrected?.assetPath ?? "",
    ...extraPaths,
  ].filter(Boolean));
  const paths = [...candidates].filter((path) => path !== keepPath && path.startsWith(ownerPrefix));
  if (!paths.length) return;
  const { error } = await admin.storage.from(QUESTION_VISUAL_BUCKET).remove(paths);
  if (error) console.warn("Visual cleanup error:", error.message);
}

async function removeOwnedPaths(ownerId: string, paths: string[]): Promise<void> {
  const ownerPrefix = `${storageSegment(ownerId)}/`;
  const safePaths = [...new Set(paths.filter((path) => path && path.startsWith(ownerPrefix)))];
  if (!safePaths.length) return;
  const { error } = await admin.storage.from(QUESTION_VISUAL_BUCKET).remove(safePaths);
  if (error) console.warn("Visual cleanup error:", error.message);
}

function freshWorkflowState(): WorkflowState {
  return cloneWorkflowState(DEFAULT_WORKFLOW_STATE);
}

function cloneWorkflowState(state: WorkflowState): WorkflowState {
  return {
    ...state,
    generationAttempts: { ...state.generationAttempts },
    reviewAttempts: { ...state.reviewAttempts },
    provisionalOriginal: state.provisionalOriginal ? { ...state.provisionalOriginal } : null,
    provisionalCorrected: state.provisionalCorrected ? { ...state.provisionalCorrected } : null,
  };
}

function workflowStateOf(row: JobRow): WorkflowState {
  const raw = asRecord(row.workflow_state);
  if (!raw) return freshWorkflowState();
  const generation = asRecord(raw.generationAttempts);
  const review = asRecord(raw.reviewAttempts);
  const stage = isWorkflowStage(raw.stage) ? raw.stage : "generate_original";
  return {
    version: 1,
    stage,
    originalAssetPath: typeof raw.originalAssetPath === "string" ? raw.originalAssetPath : null,
    correctedAssetPath: typeof raw.correctedAssetPath === "string" ? raw.correctedAssetPath : null,
    provisionalOriginal: parseProvisionalVisualAsset(raw.provisionalOriginal) ?? null,
    provisionalCorrected: parseProvisionalVisualAsset(raw.provisionalCorrected) ?? null,
    correction: typeof raw.correction === "string" ? raw.correction.slice(0, 900) : "",
    generationAttempts: {
      original: safeAttempt(generation?.original),
      corrected: safeAttempt(generation?.corrected),
    },
    reviewAttempts: {
      original: safeAttempt(review?.original),
      corrected: safeAttempt(review?.corrected),
    },
  };
}

function isWorkflowStage(value: unknown): value is WorkflowStage {
  return value === "generate_original" || value === "review_original" || value === "generate_corrected"
    || value === "review_corrected" || value === "ready" || value === "failed";
}

function safeAttempt(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return 0;
  return Math.min(value, MAX_STAGE_ATTEMPTS);
}

function stageAttempts(state: WorkflowState): number {
  if (state.stage === "generate_original") return state.generationAttempts.original;
  if (state.stage === "generate_corrected") return state.generationAttempts.corrected;
  if (state.stage === "review_original") return state.reviewAttempts.original;
  if (state.stage === "review_corrected") return state.reviewAttempts.corrected;
  return MAX_STAGE_ATTEMPTS;
}

function incrementStageAttempt(state: WorkflowState): WorkflowState {
  const next = cloneWorkflowState(state);
  if (next.stage === "generate_original") next.generationAttempts.original += 1;
  else if (next.stage === "generate_corrected") next.generationAttempts.corrected += 1;
  else if (next.stage === "review_original") next.reviewAttempts.original += 1;
  else if (next.stage === "review_corrected") next.reviewAttempts.corrected += 1;
  return next;
}

function isReviewStage(stage: WorkflowStage): boolean {
  return stage === "review_original" || stage === "review_corrected";
}

function requireWorkflowPath(asset: ProvisionalVisualAsset | null, message: string): string {
  if (!asset?.assetPath) throw httpError(message, 409);
  return asset.assetPath;
}

function isWorkerLostLeaseOrSupersededError(error: unknown): boolean {
  return error instanceof Error && error.message === WORKER_LOST_LEASE_OR_SUPERSEDED_ERROR;
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

function parseProvisionalVisualAsset(value: unknown): ProvisionalVisualAsset | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  if (typeof record.url !== "string" || !record.url.startsWith("https://")
    || typeof record.assetPath !== "string" || !record.assetPath
    || typeof record.mimeType !== "string" || !record.mimeType.startsWith("image/")
    || typeof record.model !== "string" || !record.model
    || typeof record.generatedAt !== "string" || !record.generatedAt
    || typeof record.promptVersion !== "string" || !record.promptVersion
    || record.assetKind !== "scene_2d"
    || record.renderMode !== "replace"
    || record.validated === true) return undefined;
  return {
    url: record.url,
    assetPath: record.assetPath,
    mimeType: record.mimeType,
    model: record.model,
    generatedAt: record.generatedAt,
    promptVersion: record.promptVersion,
    assetKind: "scene_2d",
    renderMode: "replace",
  };
}

function toSnapshot(row: JobRow): Record<string, unknown> {
  const workflowState = workflowStateOf(row);
  const attemptCount = workflowState.generationAttempts.original
    + workflowState.generationAttempts.corrected
    + workflowState.reviewAttempts.original
    + workflowState.reviewAttempts.corrected;
  return {
    id: row.id,
    draftId: row.draft_id,
    planItemId: row.plan_item_id,
    visualHash: row.visual_hash,
    requiredMode: "replace",
    status: row.status,
    attemptCount,
    maxAttempts: MAX_APPARENT_ATTEMPTS,
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
  return errorCodeFromStatus(errorStatus(error));
}

function errorCodeFromStatus(status: number): string {
  if (status === 401) return "AUTHENTICATION_FAILED";
  if (status === 408 || status === 504) return "STAGE_TIMEOUT";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "UPSTREAM_UNAVAILABLE";
  return "VISUAL_STAGE_FAILED";
}

function isTransientStatus(status: number): boolean {
  return [408, 429, 500, 502, 503, 504].includes(status);
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

function storageSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "item";
}
