import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const require = createRequire(import.meta.url);

function loadTypeScript() {
  try {
    return require("typescript");
  } catch {
    const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
    return require(`${globalRoot}/typescript/lib/typescript.js`);
  }
}

async function loadEdgeHelpers() {
  const ts = loadTypeScript();
  let source = await readFile(
    new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url),
    "utf8",
  );
  source = source.replace(
    /^import \{ createClient \} from "npm:@supabase\/supabase-js@2";\s*/m,
    'const createClient = () => ({ auth: { getUser: async () => ({ data: { user: { id: "test-user" } }, error: null }) } });\n',
  );
  source += `\nglobalThis.__edgeTest = {
    findGenerateContentOutputText,
    inspectGenerateContentCompletion,
    parseGeneratedJson,
    generationSchema,
    buildEvidenceCatalog,
    validateAndHydrateGeneratedPayload,
    generateAndValidate,
  };\n`;

  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  }).outputText;

  const sandbox = {
    console,
    Deno: {
      env: {
        get(name) {
          return {
            SUPABASE_URL: "https://example.supabase.co",
            SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
            GEMINI_API_KEY: "gemini-test",
            WATHIQ_APP_URL: "https://example.test/wathiq/",
          }[name] ?? null;
        },
      },
      serve() {},
    },
    URL,
    Response,
    Request,
    Headers,
    DOMException,
    AbortController,
    setTimeout,
    clearTimeout,
    crypto: globalThis.crypto,
    __fetchImpl: async () => {
      throw new Error("fetch must not run unless a test installs a mock");
    },
  };
  sandbox.fetch = (...args) => sandbox.__fetchImpl(...args);
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(javascript, sandbox, { filename: "generate-source-questions.transpiled.js" });
  return { helpers: sandbox.__edgeTest, sandbox };
}

const { helpers, sandbox } = await loadEdgeHelpers();

test("يجمع generateContent جميع أجزاء النص ثم يحلل JSON ذي المفتاح items", () => {
  const result = helpers.findGenerateContentOutputText({
    candidates: [{
      finishReason: "STOP",
      content: {
        parts: [
          { text: '{"items":[' },
          { text: "]}" },
        ],
      },
    }],
  });

  assert.equal(result.partCount, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(helpers.parseGeneratedJson(result.text))), { items: [] });
});

test("يتعامل مع finishReason قبل قبول استجابة Gemini", () => {
  const completed = helpers.inspectGenerateContentCompletion({
    candidates: [{ finishReason: "STOP", content: { parts: [{ text: "{}" }] } }],
    usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 75 },
  });
  assert.equal(completed.finishReason, "STOP");
  assert.equal(completed.promptTokens, 120);
  assert.equal(completed.outputTokens, 75);

  assert.throws(
    () => helpers.inspectGenerateContentCompletion({ candidates: [{ finishReason: "MAX_TOKENS" }] }),
    /لم يكتمل ناتج Gemini/,
  );
  assert.throws(
    () => helpers.inspectGenerateContentCompletion({ promptFeedback: { blockReason: "SAFETY" } }),
    /رفض Gemini الطلب/,
  );
});

test("يفرض المخطط ويثبت الدليل عبر معرف مقطع موثوق", () => {
  const references = [{ id: "R-1", content: "مقدمة. ينشأ الضغط عندما تؤثر قوة في مساحة محددة. نهاية." }];
  const catalog = helpers.buildEvidenceCatalog(references);
  const evidenceIds = catalog.fragments.map((fragment) => fragment.id);
  const schema = helpers.generationSchema([{ planItemId: "P-1" }], evidenceIds);
  assert.deepEqual(Array.from(schema.required), ["items"]);
  assert.deepEqual(Array.from(schema.properties.items.items.properties.planItemId.enum), ["P-1"]);
  assert.equal(Array.from(schema.properties.items.items.properties.alternatives.items.properties.sourceEvidenceId.enum).join("|"), Array.from(evidenceIds).join("|"));
  assert.equal(schema.properties.items.minItems, 1);
  assert.equal(schema.properties.items.maxItems, 1);

  const request = {
    items: [{
      planItemId: "P-1",
      questionType: "اختيار من متعدد",
      sourceReferenceId: "R-1",
    }],
    references,
  };
  const payload = {
    items: [{
      planItemId: "P-1",
      alternatives: Array.from({ length: 3 }, (_, index) => ({
        text: `ما العبارة الصحيحة عن الضغط؟ ${index + 1}`,
        options: ["الخيار أ", "الخيار ب", "الخيار ج", "الخيار د"],
        answer: "الخيار أ",
        rationale: "لأنه يوافق العلاقة العلمية الواردة في المصدر.",
        sourceEvidenceId: evidenceIds[0],
        needsReview: false,
      })),
    }],
  };

  const hydrated = helpers.validateAndHydrateGeneratedPayload(payload, request, catalog);
  assert.equal(hydrated.items[0].alternatives[0].sourceSupport, catalog.fragments[0].text);
  assert.throws(
    () => helpers.validateAndHydrateGeneratedPayload({ alternatives: [] }, request, catalog),
    /بنية الأسئلة المولدة غير صالحة/,
  );
});


test("ينفذ مسار generateContent كاملًا باستجابة منظمة مماثلة للخدمة", async () => {
  const sourceSupport = "ينشأ الضغط عندما تؤثر قوة في مساحة محددة";
  const request = {
    assessmentType: "اختبار قصير رسمي",
    assessmentPolicyId: "oman-science-assessment-2025-2026",
    topic: "الضغط",
    lessons: ["1-1 الضغط", "1-2 الضغط في السوائل"],
    grade: 10,
    subject: "الفيزياء",
    difficulty: "متوسط",
    references: [{
      id: "R-1",
      sourceTitle: "كتاب الطالب للفيزياء",
      sourceKind: "كتاب الطالب",
      pageFrom: 12,
      pageTo: 12,
      content: `مقدمة. ${sourceSupport}. نهاية.`,
    }],
    officialPlanItems: [{
      planItemId: "P-1",
      questionType: "اختيار من متعدد",
      cognitiveLevel: "معرفة",
      difficultyLevel: "متوسط",
      marks: 1,
      sourceReferenceId: "R-1",
      lessonLabel: "1-1 الضغط",
    }],
    items: [{
      planItemId: "P-1",
      questionType: "اختيار من متعدد",
      cognitiveLevel: "معرفة",
      difficultyLevel: "متوسط",
      marks: 1,
      sourceReferenceId: "R-1",
      lessonLabel: "1-1 الضغط",
    }],
  };
  const generated = {
    items: [{
      planItemId: "P-1",
      alternatives: Array.from({ length: 3 }, (_, index) => ({
        text: `ما العبارة الصحيحة عن الضغط؟ ${index + 1}`,
        options: ["الخيار أ", "الخيار ب", "الخيار ج", "الخيار د"],
        answer: "الخيار أ",
        rationale: "الإجابة مدعومة بالنص العلمي.",
        sourceEvidenceId: "EV-1-1",
        needsReview: false,
      })),
    }],
  };

  let capturedUrl = "";
  let capturedBody;
  sandbox.__fetchImpl = async (url, init) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(init.body);
    return new Response(JSON.stringify({
      candidates: [{
        finishReason: "STOP",
        content: {
          role: "model",
          parts: [
            { text: JSON.stringify(generated).slice(0, 60) },
            { text: JSON.stringify(generated).slice(60) },
          ],
        },
      }],
      usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 180 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await helpers.generateAndValidate(request, "WQ-UNITTEST");
  assert.equal(result.items.length, 1);
  assert.match(result.items[0].alternatives[0].sourceSupport, /ينشأ الضغط/);
  assert.match(capturedUrl, /v1beta\/models\/gemini-2\.5-flash:generateContent$/);
  assert.equal(capturedBody.store, false);
  assert.equal(capturedBody.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(Array.from(capturedBody.generationConfig.responseJsonSchema.required), ["items"]);
  assert.match(capturedBody.contents[0].parts[0].text, /allowedEvidenceIds/);
  assert.match(capturedBody.contents[0].parts[0].text, /EV-1-1/);
  assert.deepEqual(
    Array.from(capturedBody.generationConfig.responseJsonSchema.properties.items.items.properties.planItemId.enum),
    ["P-1"],
  );
});

test("يرفض معرف دليل تابعًا لمرجع آخر بدل قبول استناد مزيف", () => {
  const references = [
    { id: "R-1", content: "الضغط هو القوة المؤثرة عموديًا على وحدة المساحة." },
    { id: "R-2", content: "تنتقل الحرارة من الجسم الأعلى حرارة إلى الجسم الأقل حرارة." },
  ];
  const catalog = helpers.buildEvidenceCatalog(references);
  const wrongEvidence = catalog.fragments.find((fragment) => fragment.referenceId === "R-2");
  const request = {
    items: [{ planItemId: "P-1", questionType: "إجابة قصيرة", sourceReferenceId: "R-1" }],
    references,
  };
  const payload = {
    items: [{
      planItemId: "P-1",
      alternatives: Array.from({ length: 3 }, () => ({
        text: "عرّف الضغط.",
        options: [],
        answer: "القوة المؤثرة عموديًا على وحدة المساحة.",
        rationale: "هذا هو التعريف العلمي.",
        sourceEvidenceId: wrongEvidence.id,
        needsReview: false,
      })),
    }],
  };
  assert.throws(
    () => helpers.validateAndHydrateGeneratedPayload(payload, request, catalog),
    /لا ينتمي إلى مرجع المفردة/,
  );
});

test("يضيف الخادم نص الدليل نفسه ويضع علامة مراجعة عند ضعف الارتباط اللفظي", () => {
  const references = [{ id: "R-1", content: "الضغط هو القوة المؤثرة عموديًا على وحدة المساحة." }];
  const catalog = helpers.buildEvidenceCatalog(references);
  const request = {
    items: [{ planItemId: "P-1", questionType: "إجابة قصيرة", sourceReferenceId: "R-1" }],
    references,
  };
  const payload = {
    items: [{
      planItemId: "P-1",
      alternatives: Array.from({ length: 3 }, () => ({
        text: "اكتب اسم كوكب بعيد.",
        options: [],
        answer: "نبتون",
        rationale: "إجابة فلكية.",
        sourceEvidenceId: catalog.fragments[0].id,
        needsReview: false,
      })),
    }],
  };
  const hydrated = helpers.validateAndHydrateGeneratedPayload(payload, request, catalog);
  assert.equal(hydrated.items[0].alternatives[0].sourceSupport, catalog.fragments[0].text);
  assert.equal(hydrated.items[0].alternatives[0].needsReview, true);
});
