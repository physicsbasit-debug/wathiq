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
    validateGeneratedPayload,
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

test("يفرض المخطط والبنية الدلالية الكاملة لمفردة مولدة", () => {
  const schema = helpers.generationSchema([{ planItemId: "P-1" }]);
  assert.deepEqual(Array.from(schema.required), ["items"]);
  assert.deepEqual(Array.from(schema.properties.items.items.properties.planItemId.enum), ["P-1"]);
  assert.equal(schema.properties.items.minItems, 1);
  assert.equal(schema.properties.items.maxItems, 1);

  const sourceSupport = "ينشأ الضغط عندما تؤثر قوة في مساحة محددة";
  const request = {
    items: [{
      planItemId: "P-1",
      questionType: "اختيار من متعدد",
      sourceReferenceId: "R-1",
    }],
    references: [{ id: "R-1", content: `مقدمة. ${sourceSupport}. نهاية.` }],
  };
  const payload = {
    items: [{
      planItemId: "P-1",
      alternatives: Array.from({ length: 3 }, (_, index) => ({
        text: `ما العبارة الصحيحة عن الضغط؟ ${index + 1}`,
        options: ["الخيار أ", "الخيار ب", "الخيار ج", "الخيار د"],
        answer: "الخيار أ",
        rationale: "لأنه يوافق العلاقة العلمية الواردة في المصدر.",
        sourceSupport,
        needsReview: false,
      })),
    }],
  };

  assert.doesNotThrow(() => helpers.validateGeneratedPayload(payload, request));
  assert.throws(
    () => helpers.validateGeneratedPayload({ alternatives: [] }, request),
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
        sourceSupport,
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
  assert.match(capturedUrl, /v1beta\/models\/gemini-2\.5-flash:generateContent$/);
  assert.equal(capturedBody.store, false);
  assert.equal(capturedBody.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(Array.from(capturedBody.generationConfig.responseJsonSchema.required), ["items"]);
  assert.deepEqual(
    Array.from(capturedBody.generationConfig.responseJsonSchema.properties.items.items.properties.planItemId.enum),
    ["P-1"],
  );
});
