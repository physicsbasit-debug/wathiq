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
function noVisual() {
  return {
    type: "none", title: "", altText: "", xAxisLabel: "", xAxisUnit: "",
    yAxisLabel: "", yAxisUnit: "", xMin: 0, xMax: 1, yMin: 0, yMax: 1,
    points: [], labels: [], values: [], components: [], annotations: [],
  };
}


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
  const schema = helpers.generationSchema([{ planItemId: "P-1", visualTarget: "none" }], evidenceIds);
  assert.deepEqual(Array.from(schema.required), ["items"]);
  assert.deepEqual(Array.from(schema.properties.items.items.properties.planItemId.enum), ["P-1"]);
  assert.equal(Array.from(schema.properties.items.items.properties.alternatives.items.properties.sourceEvidenceId.enum).join("|"), Array.from(evidenceIds).join("|"));
  assert.equal(schema.properties.items.minItems, 1);
  assert.ok(schema.properties.items.items.properties.visual);
  const markSchemeSchema = schema.properties.items.items.properties.alternatives.items.properties.markScheme;
  assert.equal(markSchemeSchema.type, "object");
  assert.deepEqual(Array.from(markSchemeSchema.required), ["point1", "point2", "point3", "point4"]);
  assert.equal(schema.properties.items.maxItems, 1);

  const request = {
    items: [{
      planItemId: "P-1",
      questionType: "اختيار من متعدد",
      marks: 1,
      styleTarget: "مفهومي",
      visualTarget: "none",
      sourceReferenceId: "R-1",
    }],
    references,
  };
  const payload = {
    items: [{
      planItemId: "P-1",
      visual: noVisual(),
      alternatives: Array.from({ length: 3 }, (_, index) => ({
        stimulus: "",
        text: `ما العبارة الصحيحة عن الضغط؟ ${index + 1}`,
        options: ["الخيار أ", "الخيار ب", "الخيار ج", "الخيار د"],
        answer: "الخيار أ",
        rationale: "لأنه يوافق العلاقة العلمية الواردة في المصدر.",
        markScheme: ["اختيار العلاقة العلمية الصحيحة."],
        questionForm: "مفهومي",
        workingRequired: false,
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
      styleTarget: "مفهومي",
      visualTarget: "none",
    }],
    items: [{
      planItemId: "P-1",
      questionType: "اختيار من متعدد",
      cognitiveLevel: "معرفة",
      difficultyLevel: "متوسط",
      marks: 1,
      sourceReferenceId: "R-1",
      lessonLabel: "1-1 الضغط",
      styleTarget: "مفهومي",
      visualTarget: "none",
    }],
  };
  const generated = {
    items: [{
      planItemId: "P-1",
      visual: noVisual(),
      alternatives: Array.from({ length: 3 }, (_, index) => ({
        stimulus: "",
        text: `ما العبارة الصحيحة عن الضغط؟ ${index + 1}`,
        options: ["الخيار أ", "الخيار ب", "الخيار ج", "الخيار د"],
        answer: "الخيار أ",
        rationale: "الإجابة مدعومة بالنص العلمي.",
        markScheme: ["اختيار العبارة العلمية الصحيحة."],
        questionForm: "مفهومي",
        workingRequired: false,
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
    items: [{ planItemId: "P-1", questionType: "إجابة قصيرة", marks: 1, styleTarget: "مفهومي", visualTarget: "none", sourceReferenceId: "R-1" }],
    references,
  };
  const payload = {
    items: [{
      planItemId: "P-1",
      visual: noVisual(),
      alternatives: Array.from({ length: 3 }, () => ({
        stimulus: "",
        text: "عرّف الضغط.",
        options: [],
        answer: "القوة المؤثرة عموديًا على وحدة المساحة.",
        rationale: "هذا هو التعريف العلمي.",
        markScheme: ["ذكر تعريف الضغط بدقة."],
        questionForm: "مفهومي",
        workingRequired: false,
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
    items: [{ planItemId: "P-1", questionType: "إجابة قصيرة", marks: 1, styleTarget: "مفهومي", visualTarget: "none", sourceReferenceId: "R-1" }],
    references,
  };
  const payload = {
    items: [{
      planItemId: "P-1",
      visual: noVisual(),
      alternatives: Array.from({ length: 3 }, () => ({
        stimulus: "",
        text: "اكتب اسم كوكب بعيد.",
        options: [],
        answer: "نبتون",
        rationale: "إجابة فلكية.",
        markScheme: ["ذكر اسم الكوكب."],
        questionForm: "مفهومي",
        workingRequired: false,
        sourceEvidenceId: catalog.fragments[0].id,
        needsReview: false,
      })),
    }],
  };
  const hydrated = helpers.validateAndHydrateGeneratedPayload(payload, request, catalog);
  assert.equal(hydrated.items[0].alternatives[0].sourceSupport, catalog.fragments[0].text);
  assert.equal(hydrated.items[0].alternatives[0].needsReview, true);
});


test("يتحقق من مواصفة رسم خطي منظمة ويرفض نقطة خارج المحاور", () => {
  const refs = [{ id: "R-1", content: "تزداد المسافة بمرور الزمن." }];
  const catalog = helpers.buildEvidenceCatalog(refs);
  const request = { items: [{ planItemId: "P-V", questionType: "إجابة قصيرة", marks: 1, styleTarget: "بيانات", visualTarget: "line_graph", sourceReferenceId: "R-1" }], references: refs };
  const visual = {
    type: "line_graph", title: "المسافة والزمن", altText: "رسم خطي للمسافة مع الزمن",
    xAxisLabel: "الزمن", xAxisUnit: "s", yAxisLabel: "المسافة", yAxisUnit: "m",
    xMin: 0, xMax: 3, yMin: 0, yMax: 6,
    points: [{ x: 0, y: 0, label: "" }, { x: 1, y: 2, label: "" }, { x: 3, y: 6, label: "" }],
    labels: [], values: [], components: [], annotations: [],
  };
  const payload = { items: [{ planItemId: "P-V", visual, alternatives: Array.from({ length: 3 }, () => ({
    stimulus: "يوضح الرسم العلاقة بين المسافة والزمن.", text: "حدد المسافة عند 1 s.", options: [], answer: "2 m", rationale: "تقرأ القيمة من الرسم.", markScheme: ["قراءة 2 m."], questionForm: "بيانات", workingRequired: false, sourceEvidenceId: catalog.fragments[0].id, needsReview: false,
  })) }] };
  const result = helpers.validateAndHydrateGeneratedPayload(payload, request, catalog);
  assert.equal(result.items[0].visual.type, "line_graph");
  payload.items[0].visual.points[1].y = 20;
  assert.throws(() => helpers.validateAndHydrateGeneratedPayload(payload, request, catalog), /خارج نطاق المحاور/);
});


test("يحوّل خانات نموذج التصحيح الثابتة إلى نقطة مستقلة لكل درجة", () => {
  const references = [{ id: "R-1", content: "تنتقل الشحنة الكهربائية بين الأجسام عند الدلك." }];
  const catalog = helpers.buildEvidenceCatalog(references);
  const request = {
    items: [{ planItemId: "P-M", questionType: "إجابة طويلة", marks: 3, styleTarget: "استقصائي", visualTarget: "none", sourceReferenceId: "R-1" }],
    references,
  };
  const payload = {
    items: [{
      planItemId: "P-M",
      visual: noVisual(),
      alternatives: Array.from({ length: 3 }, () => ({
        stimulus: "دُلِك جسمان من مادتين مختلفتين ثم قُرّبا من قصاصات ورق.",
        text: "فسّر ما يحدث للشحنة، ثم اقترح ملاحظة تدعم تفسيرك.",
        options: [],
        answer: "تنتقل إلكترونات من جسم إلى آخر فيصبحان مشحونين، ويُستدل على ذلك بانجذاب قصاصات الورق.",
        rationale: "يربط التفسير انتقال الإلكترونات بالملاحظة التجريبية.",
        markScheme: {
          point1: "ذكر انتقال الإلكترونات بين الجسمين.",
          point2: "تحديد أن الجسمين يكتسبان شحنتين نتيجة الانتقال.",
          point3: "ربط انجذاب قصاصات الورق بوجود الشحنة.",
          point4: "",
        },
        questionForm: "استقصائي",
        workingRequired: false,
        sourceEvidenceId: catalog.fragments[0].id,
        needsReview: false,
      })),
    }],
  };
  const hydrated = helpers.validateAndHydrateGeneratedPayload(payload, request, catalog);
  assert.deepEqual(Array.from(hydrated.items[0].alternatives[0].markScheme), [
    "ذكر انتقال الإلكترونات بين الجسمين.",
    "تحديد أن الجسمين يكتسبان شحنتين نتيجة الانتقال.",
    "ربط انجذاب قصاصات الورق بوجود الشحنة.",
  ]);

  payload.items[0].alternatives[0].markScheme.point2 = "";
  assert.throws(
    () => helpers.validateAndHydrateGeneratedPayload(payload, request, catalog),
    /لا يوزع نقطة مستقلة لكل درجة/,
  );
});
