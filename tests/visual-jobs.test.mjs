import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const text = (relativePath) => readFile(new URL(relativePath, root), "utf8");

function functionBlock(source, name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `function ${name} should exist`);
  const rest = source.slice(match.index + match[0].length);
  const next = /\n(?:async\s+)?function\s+[A-Za-z0-9_]+\s*\(/.exec(rest);
  const end = next ? match.index + match[0].length + next.index : source.length;
  return source.slice(match.index, end);
}

test("العقد الدائم يحتوي المراحل والعدادات المستقلة", async () => {
  const source = await text("supabase/functions/question-visual-jobs/index.ts");
  for (const stage of ["generate_original", "review_original", "generate_corrected", "review_corrected", "ready", "failed"]) {
    assert.match(source, new RegExp(stage));
  }
  assert.match(source, /generationAttempts:\s*\{ original: number; corrected: number \}/);
  assert.match(source, /reviewAttempts:\s*\{ original: number; corrected: number \}/);
  assert.match(source, /MAX_STAGE_ATTEMPTS = 2/);
  assert.match(source, /MAX_APPARENT_ATTEMPTS = 8/);
});

test("attempt_count و max_attempts القديمان لا يعملان gate للـworkflow", async () => {
  const source = await text("supabase/functions/question-visual-jobs/index.ts");
  const process = functionBlock(source, "processJob");
  assert.doesNotMatch(process, /row\.attempt_count\s*>=\s*row\.max_attempts/);
  assert.doesNotMatch(process, /row\.attempt_count\s*\+\s*1/);
  assert.match(process, /stageAttempts\(state\)\s*>=\s*MAX_STAGE_ATTEMPTS/);
});

test("عداد المرحلة يستهلك عند claim قبل استدعاء خدمة Gemini", async () => {
  const source = await text("supabase/functions/question-visual-jobs/index.ts");
  const process = functionBlock(source, "processJob");
  const incrementAt = process.indexOf("incrementStageAttempt(state)");
  const invokeAt = process.indexOf("invokeStage(");
  assert.ok(incrementAt >= 0 && invokeAt > incrementAt);
  assert.match(process, /workflow_state:\s*claimedState/);
});

test("generate يستخدم generating و review يستخدم validating", async () => {
  const source = await text("supabase/functions/question-visual-jobs/index.ts");
  const process = functionBlock(source, "processJob");
  assert.match(process, /isReviewStage\(state\.stage\) \? "validating" : "generating"/);
});

test("النبض الحيوي محمي بـ worker_id ويمنع التداخل", async () => {
  const source = await text("supabase/functions/question-visual-jobs/index.ts");
  const process = functionBlock(source, "processJob");
  assert.match(source, /HEARTBEAT_INTERVAL_MS = 15_000/);
  assert.match(source, /WORKER_LEASE_TIMEOUT_MS = 45_000/);
  assert.match(process, /let inFlight = false/);
  assert.match(process, /if \(inFlight\) return/);
  assert.match(process, /\.eq\("id", jobId\)\.eq\("worker_id", workerId\)/);
});

test("استعادة العامل المتوقف تعيد نفس المرحلة ولا تعيد العداد", async () => {
  const source = await text("supabase/functions/question-visual-jobs/index.ts");
  const recover = functionBlock(source, "recoverStaleJobs");
  assert.match(recover, /WORKER_LEASE_TIMEOUT_MS/);
  assert.match(recover, /status: "retry_pending"/);
  assert.match(recover, /\.not\("worker_id", "is", null\)/);
  assert.doesNotMatch(recover, /attempt_count/);
  assert.doesNotMatch(recover, /workflow_state:/);
});

test("payload كل مرحلة يستخدم الصورة أو correction الصحيح", async () => {
  const source = await text("supabase/functions/question-visual-jobs/index.ts");
  const invoke = functionBlock(source, "invokeStage");
  assert.match(invoke, /state\.stage === "generate_corrected"[^\n]*body\.correction = state\.correction/);
  assert.match(invoke, /state\.stage === "review_original"[^\n]*state\.provisionalOriginal/);
  assert.match(invoke, /state\.stage === "review_corrected"[^\n]*state\.provisionalCorrected/);
  assert.doesNotMatch(invoke, /previousAssetPath/);
});

test("review transient يعيد نفس stage ولا يولد صورة جديدة", async () => {
  const source = await text("supabase/functions/question-visual-jobs/index.ts");
  const apply = functionBlock(source, "applyStageResult");
  const transientAt = apply.indexOf('result.kind === "transient_error"');
  assert.ok(transientAt >= 0);
  const tail = apply.slice(transientAt);
  assert.match(tail, /workflow_state:\s*state/);
  assert.match(tail, /status: "retry_pending"/);
  assert.doesNotMatch(tail.slice(0, tail.indexOf("terminalFailure", 100)), /generate_corrected/);
});

test("scientific rejection للأصل وحده ينتقل إلى generate_corrected", async () => {
  const source = await text("supabase/functions/question-visual-jobs/index.ts");
  const apply = functionBlock(source, "applyStageResult");
  assert.match(apply, /state\.stage === "review_original"/);
  assert.match(apply, /next\.correction = result\.correction/);
  assert.match(apply, /next\.stage = "generate_corrected"/);
  assert.match(apply, /SCIENTIFIC_REJECTION/);
});

test("provisional لا يكتب في final asset قبل approval", async () => {
  const source = await text("supabase/functions/question-visual-jobs/index.ts");
  const apply = functionBlock(source, "applyStageResult");
  const generated = apply.slice(apply.indexOf('result.kind === "generated"'), apply.indexOf('result.kind === "approved"'));
  assert.doesNotMatch(generated, /asset:\s*result\.asset/);
  assert.match(generated, /provisionalOriginal = result\.asset/);
  assert.match(generated, /provisionalCorrected = result\.asset/);
  const approved = apply.slice(apply.indexOf('result.kind === "approved"'));
  assert.match(approved, /validated: true/);
  assert.match(approved, /asset:\s*finalAsset/);
});

test("cleanup يحدث فقط بعد fenced DB update ناجح", async () => {
  const source = await text("supabase/functions/question-visual-jobs/index.ts");
  const apply = functionBlock(source, "applyStageResult");
  const updateAt = apply.indexOf("const updated = await fencedStageUpdate");
  const cleanupAt = apply.indexOf("cleanupKnownProvisionalAssets", updateAt);
  assert.ok(updateAt >= 0 && cleanupAt > updateAt);
  assert.match(source, /async function fencedStageUpdate/);
  assert.match(functionBlock(source, "fencedStageUpdate"), /\.eq\("worker_id", workerId\)/);
});

test("snapshot يعرض مجموع المحاولات و maxAttempts=8", async () => {
  const source = await text("supabase/functions/question-visual-jobs/index.ts");
  const snapshot = functionBlock(source, "toSnapshot");
  assert.match(snapshot, /generationAttempts\.original/);
  assert.match(snapshot, /generationAttempts\.corrected/);
  assert.match(snapshot, /reviewAttempts\.original/);
  assert.match(snapshot, /reviewAttempts\.corrected/);
  assert.match(snapshot, /maxAttempts:\s*MAX_APPARENT_ATTEMPTS/);
});

test("الخادم يكمل مراحل الصورة دون انتظار polling من المتصفح", async () => {
  const source = await text("supabase/functions/question-visual-jobs/index.ts");
  const process = functionBlock(source, "processJob");
  const continuation = functionBlock(source, "continueServerDrivenWorkflow");

  const calls = process.match(/await continueServerDrivenWorkflow\(/g) ?? [];
  assert.equal(calls.length, 2, "يجب متابعة المسار بعد النتيجة العادية وبعد مسار catch");
  assert.match(continuation, /row\.status !== "retry_pending"/);
  assert.match(continuation, /state\.stage === "ready" \|\| state\.stage === "failed"/);
  assert.match(continuation, /await processJob\(jobId, accessToken, requestId\)/);
  assert.doesNotMatch(continuation, /scheduleRows\(/);
});

test("إعادة المرحلة المؤقتة داخل الخادم قصيرة ومحدودة بعدادات المرحلة", async () => {
  const source = await text("supabase/functions/question-visual-jobs/index.ts");
  const continuation = functionBlock(source, "continueServerDrivenWorkflow");
  const process = functionBlock(source, "processJob");

  assert.match(source, /SERVER_DRIVEN_TRANSIENT_RETRY_DELAY_MS = 1_000/);
  assert.match(
    continuation,
    /result\.kind === "transient_error"[^]*delay\(SERVER_DRIVEN_TRANSIENT_RETRY_DELAY_MS\)/,
  );
  assert.match(process, /stageAttempts\(state\) >= MAX_STAGE_ATTEMPTS/);
  assert.match(source, /MAX_STAGE_ATTEMPTS = 2/);
});
