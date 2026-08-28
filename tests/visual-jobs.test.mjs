import assert from "node:assert/strict";
import test from "node:test";
import { visualJobItems, VisualJobService } from "../dist/assets/visual-jobs.js";
import { readFileSync } from "node:fs";

function draftWithVisual(type, extra = {}) {
  return {
    id: "draft-1", programmeId: "igcse", syllabusCode: "0625", grade: null,
    selectedProposalByPlanItem: { p1: "q1" },
    plan: [{
      id: "p1", lessonLabel: "القوى والحركة",
      visual: { type, visualId: "v1", purpose: "توضيح", title: "مرئي", altText: "مرئي علمي", xAxisLabel: "", xAxisUnit: "", yAxisLabel: "", yAxisUnit: "", xMin: 0, xMax: 1, yMin: 0, yMax: 1, points: [], series: [], labels: [], values: [], components: [], annotations: [], tableColumns: [], tableRows: [], tableCells: [], hiddenCells: [], vectors: [], anchors: [], segments: [], dimensions: [], ...extra },
      proposals: [{ id: "q1", stimulus: "", text: "فسر العلاقة.", answer: "", reviewSupport: "سياق كامبريدج العالمي" }],
    }],
  };
}

test("كل context_scene ينشئ مهمة صورة 2D", () => {
  const items = visualJobItems(draftWithVisual("context_scene"), "الفيزياء");
  assert.equal(items.length, 1);
  assert.equal(items[0].requiredMode, "replace");
  assert.equal(items[0].programmeId, "igcse");
  assert.equal(items[0].stageLabel, "كامبريدج للشهادة الدولية العامة للتعليم الثانوي");
});

test("الرسم البياني الدقيق لا يرسل إلى نموذج الصور", () => {
  const draft = draftWithVisual("line_graph", {
    title: "الزمن والمسافة", altText: "رسم بيانات", xAxisLabel: "الزمن", yAxisLabel: "المسافة", xMin: 0, xMax: 1, yMin: 0, yMax: 2,
    points: [{ x: 0, y: 0, label: "" }, { x: 1, y: 2, label: "" }], labels: [],
  });
  assert.equal(visualJobItems(draft, "الفيزياء").length, 0);
});

test("VisualJobService يرسل المشهد 2D إلى الوظيفة الدائمة", async () => {
  const calls = [];
  const service = new VisualJobService(
    { supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "sb_publishable_test" },
    async () => ({ accessToken: "token" }),
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ jobs: [{
        id: "job-1", draftId: "draft-1", planItemId: "p1", visualHash: "h", requiredMode: "replace", status: "queued",
        attemptCount: 0, maxAttempts: 2, errorCode: "", errorMessage: "", startedAt: "", completedAt: "", updatedAt: "now",
      }] }), { status: 200 });
    },
  );
  const jobs = await service.enqueue("draft-1", visualJobItems(draftWithVisual("context_scene"), "الفيزياء"));
  assert.equal(jobs.length, 1);
  assert.match(calls[0].url, /question-visual-jobs$/);
});


test("VisualJobService لا يعتبر jobs=[] نجاحًا عندما توجد صورة مطلوبة", async () => {
  const service = new VisualJobService(
    { supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "sb_publishable_test" },
    async () => ({ accessToken: "token" }),
    async () => new Response(JSON.stringify({ jobs: [] }), { status: 200 }),
  );
  await assert.rejects(
    () => service.enqueue("draft-1", visualJobItems(draftWithVisual("context_scene"), "الفيزياء")),
    /لم تنشئ منظومة الصور 1 مهمة ثنائية الأبعاد مطلوبة/,
  );
});

// Regression test for textField helper function fix
test("textField helper function is correctly defined in question-visual-jobs Edge Function", () => {
  const edgeFunctionPath = "supabase/functions/question-visual-jobs/index.ts";
  const content = readFileSync(edgeFunctionPath, "utf8");

  // Verify textField function is defined locally (not imported)
  assert.ok(
    content.includes("function textField(value: unknown): string"),
    "textField function should be defined locally in the Edge Function"
  );

  // Verify the function implementation is correct
  assert.ok(
    content.includes("return typeof value === \"string\" ? value.trim() : \"\";"),
    "textField function should trim strings and return empty string for non-strings"
  );

  // Verify there's no export of textField (to maintain encapsulation)
  assert.ok(
    !content.includes("export { textField"),
    "textField should not be exported from the Edge Function"
  );

  // Verify all three usages of textField exist
  assert.ok(
    content.split("textField(").length >= 4, // function definition + 3 usages
    "textField should be used in all three required locations"
  );

  // Verify context_scene check is present
  assert.ok(
    content.includes('textField(row.request_payload.visual.type) !== "context_scene"'),
    "context_scene check should be present in processJob"
  );

  // Verify isContextSceneJobInput uses textField
  assert.ok(
    content.includes("return textField(visual?.type) === \"context_scene\";"),
    "isContextSceneJobInput should use textField"
  );

  // Verify parseJobInput uses textField for validation
  assert.ok(
    content.includes('if (textField(visual.type) !== "context_scene") throw httpError'),
    "parseJobInput should use textField to validate visual type"
  );

  // Verify STRUCTURED_VISUAL_RENDERED_LOCALLY error path is preserved
  assert.ok(
    content.includes('error_code: "STRUCTURED_VISUAL_RENDERED_LOCALLY"'),
    "STRUCTURED_VISUAL_RENDERED_LOCALLY error path should be preserved"
  );
});

// Helper function to extract function body from source
function extractFunctionBody(source, functionName) {
  const startPattern = new RegExp(
    `^async\\s+function\\s+${functionName}\\s*\\(`,
    'm'
  );
  const match = startPattern.exec(source);
  if (!match) return null;

  const start = match.index;
  const afterStart = source.slice(start + match[0].length);

  const nextFunction = /^(?:async\s+)?function\s+\w+\s*\(/m.exec(afterStart);

  const end = nextFunction
    ? start + match[0].length + nextFunction.index
    : source.length;

  return source.slice(start, end);
}

// Helper function to extract a code slice between two markers
function extractCodeSlice(source, startMarker, endMarker) {
  const startIndex = source.indexOf(startMarker);
  if (startIndex === -1) return null;

  const adjustedStart = startIndex + startMarker.length;
  const endIndex = source.indexOf(endMarker, adjustedStart);
  if (endIndex === -1) return null;

  return source.slice(adjustedStart, endIndex);
}

test("ثوابت النبض الحيوي والفواصل موجودة", () => {
  const edgeFunctionPath = "supabase/functions/question-visual-jobs/index.ts";
  const source = readFileSync(edgeFunctionPath, "utf8");

  assert.ok(source.includes('const HEARTBEAT_INTERVAL_MS = 15_000;'),
    'HEARTBEAT_INTERVAL_MS should be 15_000');
  assert.ok(source.includes('const WORKER_LEASE_TIMEOUT_MS = 45_000;'),
    'WORKER_LEASE_TIMEOUT_MS should be 45_000');
  assert.ok(source.includes('const INTERNAL_GENERATION_TIMEOUT_MS = 165_000;'),
    'INTERNAL_GENERATION_TIMEOUT_MS should be 165_000');
  assert.ok(source.includes('const STALE_JOB_MS = 5 * 60_000;'),
    'STALE_JOB_MS should be 5 * 60_000');
});

test("تحديث النبض الحيوي يتضمن السياج وتجنب التداخل", () => {
  const edgeFunctionPath = "supabase/functions/question-visual-jobs/index.ts";
  const source = readFileSync(edgeFunctionPath, "utf8");

  // Extract the heartbeat update slice from processJob
  const processJobSource = extractFunctionBody(source, 'processJob');
  assert.ok(processJobSource, 'processJob function should exist');

  const heartbeatSlice = extractCodeSlice(processJobSource,
    '// Start heartbeat updates (serial, in-flight guard)',
    'const response = await invokeGenerator');
  assert.ok(heartbeatSlice, 'Heartbeat update slice should exist');

  // Check for fencing
  assert.ok(/\.eq\("id", jobId\)\.eq\("worker_id", workerId\)\.select\("id"\)\.maybeSingle\(\)/.test(heartbeatSlice),
    'Heartbeat update should include worker_id fencing');

  // Check for inFlight guard
  assert.ok(/let\s+inFlight\s*=\s*false;/.test(heartbeatSlice),
    'Should declare inFlight = false');
  assert.ok(/if\s*\(\s*inFlight\s*\)\s*return;/.test(heartbeatSlice),
    'Should have inFlight guard to prevent overlap');

  // Check heartbeatError does NOT stop interval
  const heartbeatErrorBranch = extractCodeSlice(heartbeatSlice,
    'if (heartbeatError) {',
    '} else if (!heartbeatData) {'
  );
  assert.ok(heartbeatErrorBranch, 'heartbeatError branch should exist');
  assert.ok(
    !/clearInterval\s*\(\s*heartbeatInterval\s*\)/.test(heartbeatErrorBranch),
    'Heartbeat error should not stop interval'
  );

  // Check !heartbeatData stops interval
  assert.ok(/!heartbeatData[\s\S]*?clearInterval\(heartbeatInterval\);[\s\S]*?heartbeatInterval\s*=\s*null/.test(heartbeatSlice),
    'Missing heartbeat data should stop interval');

  // Check finally cleanup
  assert.ok(/finally\s*\{[\s\S]*?if\s*\(heartbeatInterval\s*!==\s*null\)[\s\S]*?clearInterval\(heartbeatInterval\);[\s\S]*?heartbeatInterval\s*=\s*null/.test(processJobSource),
    'Finally block should cleanup heartbeatInterval');
});

test("الانتقال إلى validating يتضمن السياج وفقدان الإيجارة يُعامل بشكل منفصل", () => {
  const edgeFunctionPath = "supabase/functions/question-visual-jobs/index.ts";
  const source = readFileSync(edgeFunctionPath, "utf8");

  const invokeGeneratorSource = extractFunctionBody(source, 'invokeGenerator');
  assert.ok(invokeGeneratorSource, 'invokeGenerator function should exist');

  // Check workerId parameter
  assert.ok(/async\s+function\s+invokeGenerator\s*\([^)]*workerId\s*:/.test(invokeGeneratorSource) ||
            /invokeGenerator\s*\([^)]*,\s*[^)]*,\s*[^)]*,\s*workerId\s*:/.test(source.replace(/\s+/g, ' ')),
    'invokeGenerator should accept workerId parameter');

  // Check validating update includes workerId fencing
  const normalizedInvokeGenerator = invokeGeneratorSource.replace(/\s+/g, '');
  assert.ok(
    normalizedInvokeGenerator.includes(
      '.eq("id",jobId).eq("status","generating").eq("worker_id",workerId).select("id").maybeSingle()'
    ),
    'Validating update should include worker_id fencing'
  );

  // Check validatingError throws infrastructure error
  assert.ok(/if\s*\(\s*validatingError\s*\)[\s\S]*?new\s+Error\s*\(\s*["']INFRASTRUCTURE_ERROR_IN_VALIDATING["']/.test(invokeGeneratorSource),
    'validatingError should throw INFRASTRUCTURE_ERROR_IN_VALIDATING');

  // Check !validatingData throws lease lost error
  assert.ok(/if\s*\(\s*!validatingData\s*\)[\s\S]*?new\s+Error\s*\(\s*WORKER_LOST_LEASE_OR_SUPERSEDED_ERROR/.test(invokeGeneratorSource) ||
            /if\s*\(\s*!validatingData\s*\)[\s\S]*?throw\s+new\s+Error\s*\(\s*["']WORKER_LOST_LEASE_OR_SUPERSEDED_ERROR["']/.test(invokeGeneratorSource),
    '!validatingData should throw WORKER_LOST_LEASE_OR_SUPERSEDED_ERROR');

  // Check no direct handleRetryOrFailure in these paths
  const validatingErrorSlice = extractCodeSlice(invokeGeneratorSource,
    'if (validatingError)',
    '}');
  const notValidatingDataSlice = extractCodeSlice(invokeGeneratorSource,
    'if (!validatingData)',
    '}');

  assert.ok(!validatingErrorSlice || !/handleRetryOrFailure/.test(validatingErrorSlice),
    'validatingError path should not call handleRetryOrFailure directly');
  assert.ok(!notValidatingDataSlice || !/handleRetryOrFailure/.test(notValidatingDataSlice),
    '!validatingData path should not call handleRetryOrFailure directly');
});

test("استعادة العامل المتوقف تستخدم مهلة الإيجارة وتحافظ على attempt_count", () => {
  const edgeFunctionPath = "supabase/functions/question-visual-jobs/index.ts";
  const source = readFileSync(edgeFunctionPath, "utf8");

  const recoverStaleJobsSource = extractFunctionBody(source, 'recoverStaleJobs');
  assert.ok(recoverStaleJobsSource, 'recoverStaleJobs function should exist');

  // Check leaseBefore uses WORKER_LEASE_TIMEOUT_MS
  assert.ok(/const\s+leaseBefore\s*=\s*new\s+Date\s*\(\s*Date\.now\s*\(\s*\)\s*-\s*WORKER_LEASE_TIMEOUT_MS\s*\)/.test(recoverStaleJobsSource),
    'leaseBefore should use WORKER_LEASE_TIMEOUT_MS');

  // Check .not("worker_id", "is", null)
  assert.ok(/\.not\("worker_id", "is", null\)/.test(recoverStaleJobsSource),
    'Should check worker_id is not null');

  // Check .or(`heartbeat_at.is.null,heartbeat_at.lt.${leaseBefore}`)
  const normalizedRecoverStaleJobs = recoverStaleJobsSource.replace(/\s+/g, '');
  assert.ok(
    normalizedRecoverStaleJobs.includes(
      '.or(\`heartbeat_at.is.null,heartbeat_at.lt.${leaseBefore}\`)'
    ),
    'Should use lease-based heartbeat check'
  );

  // Check update fields
  assert.ok(/status:\s*"retry_pending"/.test(recoverStaleJobsSource),
    'Should set status to retry_pending');
  assert.ok(/error_code:\s*"STALE_WORKER_RECOVERED"/.test(recoverStaleJobsSource),
    'Should set error_code to STALE_WORKER_RECOVERED');
  assert.ok(/worker_id:\s*null/.test(recoverStaleJobsSource),
    'Should set worker_id to null');
  assert.ok(/heartbeat_at:\s*null/.test(recoverStaleJobsSource),
    'Should set heartbeat_at to null');

  // Check attempt_count is NOT in the update
  assert.ok(!/attempt_count\s*:/.test(recoverStaleJobsSource.replace(/[\s\S]*?status:\s*"retry_pending"[\s\S]*?}/, '')),
    'attempt_count should not be set in the lease recovery update');

  // Check fallback uses STALE_JOB_MS and updated_at
  assert.ok(/STALE_JOB_MS/.test(recoverStaleJobsSource),
    'Fallback should use STALE_JOB_MS');
  assert.ok(/\.lt\("updated_at", staleBefore\)/.test(recoverStaleJobsSource),
    'Fallback should check updated_at < staleBefore');
});

test("قائمة إعادة المحاولة تتضمن فقط الأخطاء البنيوية التحتية", () => {
  const edgeFunctionPath = "supabase/functions/question-visual-jobs/index.ts";
  const source = readFileSync(edgeFunctionPath, "utf8");

  const handleRetryOrFailureSource = extractFunctionBody(source, 'handleRetryOrFailure');
  assert.ok(handleRetryOrFailureSource, 'handleRetryOrFailure function should exist');

  // Check retryableInfrastructureCodes definition
  assert.ok(/const\s+retryableInfrastructureCodes\s*=\s*new\s+Set\(\s*\["GENERATION_TIMEOUT",\s*"RATE_LIMITED",\s*"UPSTREAM_UNAVAILABLE"\]\s*\)/.test(handleRetryOrFailureSource),
    'retryableInfrastructureCodes should contain only GENERATION_TIMEOUT, RATE_LIMITED, UPSTREAM_UNAVAILABLE');

  // Check shouldRetry condition
  assert.ok(/const\s+shouldRetry\s*=\s*retryableInfrastructureCodes\.has\(code\)\s*&&\s*row\.attempt_count\s*<\s*row\.max_attempts;/.test(handleRetryOrFailureSource),
    'shouldRetry should check code in whitelist AND attempt_count < max_attempts');

  // Check that AUTHENTICATION_FAILED and VISUAL_GENERATION_FAILED are NOT in the whitelist
  assert.ok(!/["']AUTHENTICATION_FAILED["']/.test(handleRetryOrFailureSource) ||
            !/["']VISUAL_GENERATION_FAILED["']/.test(handleRetryOrFailureSource),
    'Whitelist should not contain AUTHENTICATION_FAILED or VISUAL_GENERATION_FAILED');
});

test("فشل المزود/العلوم ينهي الفشل مباشرة دون handleRetryOrFailure", () => {
  const edgeFunctionPath = "supabase/functions/question-visual-jobs/index.ts";
  const source = readFileSync(edgeFunctionPath, "utf8");

  const processJobSource = extractFunctionBody(source, 'processJob');
  assert.ok(processJobSource, 'processJob function should exist');

  // Extract the science/provider failure slice
  const failureSlice = extractCodeSlice(processJobSource,
    '// Science/provider failure',
    '} catch (error)');
  assert.ok(failureSlice, 'Science/provider failure slice should exist');

  // Check update includes worker_id fencing
  assert.ok(/\.eq\("id", row\.id\)\.eq\("worker_id", workerId\)/.test(failureSlice),
    'Failure update should include worker_id fencing');

  // Check status: "failed"
  assert.ok(/status:\s*"failed"/.test(failureSlice),
    'Should set status to failed');

  // Check error_message: response.reason
  assert.ok(/error_message:\s*response\.reason/.test(failureSlice),
    'Should set error_message to response.reason');

  // Check worker_id: null
  assert.ok(/worker_id:\s*null/.test(failureSlice),
    'Should set worker_id to null');

  // Check completed_at exists
  assert.ok(/completed_at:/.test(failureSlice),
    'Should set completed_at');

  // Check NO handleRetryOrFailure in this slice
  assert.ok(!/handleRetryOrFailure/.test(failureSlice),
    'Science/provider failure path should NOT call handleRetryOrFailure');

  // Check for explicit return after update
  assert.ok(/return;/.test(failureSlice.slice(failureSlice.lastIndexOf('}') - 20)),
    'Should return after failure update');
});

test("عقد الحد الأقصى للمحاولات: المحاولة الثانية نهائية", () => {
  const edgeFunctionPath = "supabase/functions/question-visual-jobs/index.ts";
  const source = readFileSync(edgeFunctionPath, "utf8");

  // Check processJob increments attempt count on claim
  const processJobSource = extractFunctionBody(source, 'processJob');
  assert.ok(processJobSource, 'processJob function should exist');

  // Look for attempt increment pattern: const attempt = row.attempt_count + 1
  assert.ok(/const\s+attempt\s*=\s*row\.attempt_count\s*\+\s*1/.test(processJobSource),
    'processJob should calculate attempt as row.attempt_count + 1');

  // Check that attempt is used in claim update: attempt_count: attempt
  assert.ok(/attempt_count\s*:\s*attempt/.test(processJobSource),
    'Claim update should set attempt_count to the calculated attempt value');

  // Check handleRetryOrFailure condition
  const handleRetryOrFailureSource = extractFunctionBody(source, 'handleRetryOrFailure');
  assert.ok(handleRetryOrFailureSource, 'handleRetryOrFailure function should exist');

  assert.ok(/const\s+shouldRetry\s*=\s*retryableInfrastructureCodes\.has\(code\)\s*&&\s*row\.attempt_count\s*<\s*row\.max_attempts;/.test(handleRetryOrFailureSource),
    'handleRetryOrFailure should check attempt_count < max_attempts for retry');

  // Check max_attempts is 2 in job creation
  assert.ok(/max_attempts\s*:\s*2/.test(source),
    'max_attempts should be set to 2 when creating jobs');

  // Contract verification:
  // attempt 1: row.attempt_count = 0 -> attempt = 1 -> claim sets attempt_count: 1 -> handleRetryOrFailure sees 1 < 2 => retry allowed
  // attempt 2: row.attempt_count = 1 -> attempt = 2 -> claim sets attempt_count: 2 -> handleRetryOrFailure sees 2 < 2 => false => final failure
  // No attempt 3 possible
});