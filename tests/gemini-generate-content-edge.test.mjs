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
    buildServerOwnedVisualSpec,
    generationThinkingBudget,
    generationOutputTokenLimit,
    markSchemeRepairSchema,
    hasExactMarkScheme,
    buildFallbackMarkScheme,
    isMetaSourceQuestion,
    referenceSupportsLessonScope,
    parseGenerationRequest,
    generateAndValidate,
    extractTrustedEnrichmentContext,
    isTrustedScientificHost,
    normalizeTransientGeminiMessage,
    hasEvidenceAffinity,
    isTransportRetryExhausted,
    hasSufficientQuestionContext,
    parseVisualIllustrationRequest,
    isControlledIllustrationEligible,
    buildControlledIllustrationPrompt,
    findGeneratedImagePart,
    fixedVisualContainsCalculationData,
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

test("يقبل نطاقات الجهات الحكومية والجامعية ويرفض المصادر العامة", () => {
  assert.equal(helpers.isTrustedScientificHost("nasa.gov"), true);
  assert.equal(helpers.isTrustedScientificHost("education.gov.uk"), true);
  assert.equal(helpers.isTrustedScientificHost("squ.edu.om"), true);
  assert.equal(helpers.isTrustedScientificHost("physics.cam.ac.uk"), true);
  assert.equal(helpers.isTrustedScientificHost("random-science-blog.com"), false);
});

test("يستخرج فقط الجمل المسندة إلى مصادر رسمية من groundingMetadata", () => {
  const context = helpers.extractTrustedEnrichmentContext({
    candidates: [{
      content: { parts: [{ text: "تستخدم الأقمار الصناعية قياسات دقيقة لمراقبة الغلاف الجوي. تنتشر شائعة غير موثقة في بعض المواقع." }] },
      groundingMetadata: {
        groundingChunks: [
          { web: { uri: "https://www.nasa.gov/science/", title: "nasa.gov" } },
          { web: { uri: "https://random-science-blog.com/post", title: "Random science blog" } },
        ],
        groundingSupports: [
          { segment: { text: "تستخدم الأقمار الصناعية قياسات دقيقة لمراقبة الغلاف الجوي." }, groundingChunkIndices: [0] },
          { segment: { text: "تنتشر شائعة غير موثقة في بعض المواقع." }, groundingChunkIndices: [1] },
        ],
      },
    }],
  });
  assert.equal(context.attempted, true);
  assert.equal(context.segments.length, 1);
  assert.equal(context.segments[0].sourceTitle, "nasa.gov");
  assert.match(context.segments[0].sourceUrl, /^https:\/\/www\.nasa\.gov/);
});

test("يعرب رسالة الضغط المؤقت بدل تمرير خطأ Gemini الإنجليزي", () => {
  assert.match(helpers.normalizeTransientGeminiMessage("This model is currently experiencing high demand. Please try again later.", 503), /النموذج مشغول مؤقتًا/);
  assert.match(helpers.normalizeTransientGeminiMessage("request timed out", 408), /تأخر رد النموذج/);
});

test("يعد الرسم أو الجدول متنًا صالحًا ولا يرفض السؤال البصري بسبب stimulus فارغ", () => {
  assert.equal(helpers.hasSufficientQuestionContext(
    "",
    "بالاعتماد على الجدول المرفق، استنتج العلاقة بين الزمن والمسافة.",
    "بيانات",
    "data_table",
  ), true);
  assert.equal(helpers.hasSufficientQuestionContext(
    "",
    "فسر النتيجة.",
    "سياقي",
    "none",
  ), false);
});



test("يقبل المرجع المقيد بصفحات الدرس ولو لم يتكرر عنوان الدرس حرفيًا داخل المقطع", () => {
  const reference = {
    id: "R-PAGE",
    sourceId: "SOURCE-10-PHYSICS",
    sourceTitle: "كتاب الطالب للفيزياء",
    sourceKind: "كتاب الطالب",
    pageFrom: 93,
    pageTo: 94,
    content: "تنطلق جسيمات ألفا من بعض الأنوية غير المستقرة، وقد يصاحب التحلل إشعاع جاما.",
    lessonTopic: "9-1 النشاط الإشعاعي في كل مكان",
    lessonScopeMode: "page-range",
    lessonPageFrom: 93,
    lessonPageTo: 95,
  };
  assert.equal(helpers.referenceSupportsLessonScope("9-1 النشاط الإشعاعي في كل مكان", reference), true);

  const outside = { ...reference, pageFrom: 101, pageTo: 102 };
  assert.equal(helpers.referenceSupportsLessonScope("9-1 النشاط الإشعاعي في كل مكان", outside), false);
});

test("يبقي البحث الاحتياطي خارج نطاق الصفحات مشروطًا بتطابق عنوان الدرس", () => {
  const fallback = {
    id: "R-FALLBACK",
    sourceId: "SOURCE-10-PHYSICS",
    sourceTitle: "كتاب الطالب للفيزياء",
    sourceKind: "كتاب الطالب",
    pageFrom: 110,
    pageTo: 110,
    content: "يؤثر الضغط في السوائل مع زيادة العمق.",
    lessonTopic: "9-1 النشاط الإشعاعي في كل مكان",
    lessonScopeMode: "strict-title-fallback",
  };
  assert.equal(helpers.referenceSupportsLessonScope("9-1 النشاط الإشعاعي في كل مكان", fallback), false);
});

test("يتحقق الخادم من تطابق الدرس ونطاق الصفحة قبل استدعاء Gemini", () => {
  const item = (planItemId, questionType, cognitiveLevel, marks, lessonLabel, sourceReferenceId) => ({
    planItemId,
    questionType,
    cognitiveLevel,
    marks,
    sourceReferenceId,
    lessonLabel,
    styleTarget: questionType === "إجابة طويلة" ? "حسابي" : "مفهومي",
    visualTarget: "none",
  });
  const sentItem = item(
    "P-SCOPE",
    "اختيار من متعدد",
    "معرفة",
    1,
    "9-1 النشاط الإشعاعي في كل مكان",
    "R-SCOPE",
  );
  const officialPlanItems = [
    sentItem,
    item("P-2", "اختيار من متعدد", "تطبيق", 1, "9-2 فهم النشاط الإشعاعي", "R-OTHER-2"),
    item("P-3", "إجابة قصيرة", "معرفة", 1, "9-1 النشاط الإشعاعي في كل مكان", "R-OTHER-3"),
    item("P-4", "إجابة قصيرة", "معرفة", 2, "9-1 النشاط الإشعاعي في كل مكان", "R-OTHER-4"),
    item("P-5", "إجابة قصيرة", "استدلال", 2, "9-2 فهم النشاط الإشعاعي", "R-OTHER-5"),
    item("P-6", "إجابة طويلة", "تطبيق", 3, "9-2 فهم النشاط الإشعاعي", "R-OTHER-6"),
  ];
  const raw = {
    assessmentType: "اختبار قصير رسمي",
    assessmentPolicyId: "oman-science-assessment-2025-2026",
    topic: "النشاط الإشعاعي، فهم النشاط الإشعاعي",
    lessons: ["9-1 النشاط الإشعاعي في كل مكان", "9-2 فهم النشاط الإشعاعي"],
    grade: 10,
    subject: "الفيزياء",
    difficulty: "متوسط",
    references: [{
      id: "R-SCOPE",
      sourceId: "SOURCE-10-PHYSICS",
      sourceTitle: "كتاب الطالب للفيزياء",
      sourceKind: "كتاب الطالب",
      pageFrom: 93,
      pageTo: 94,
      content: "تنطلق جسيمات ألفا من بعض الأنوية غير المستقرة.",
      lessonTopic: "9-1 النشاط الإشعاعي في كل مكان",
      lessonScopeMode: "page-range",
      lessonPageFrom: 93,
      lessonPageTo: 95,
    }],
    officialPlanItems,
    items: [sentItem],
  };
  const parsed = helpers.parseGenerationRequest(raw);
  assert.equal(parsed.references[0].lessonScopeMode, "page-range");

  const invalid = structuredClone(raw);
  invalid.references[0].pageFrom = 110;
  invalid.references[0].pageTo = 110;
  assert.throws(() => helpers.parseGenerationRequest(invalid), /خارج نطاق الدرس الموثق/);
});

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
  const itemSchema = schema.properties.items.prefixItems[0];
  assert.deepEqual(Array.from(itemSchema.properties.planItemId.enum), ["P-1"]);
  assert.equal(Array.from(itemSchema.properties.alternatives.items.properties.sourceEvidenceId.enum).join("|"), Array.from(evidenceIds).join("|"));
  assert.equal(schema.properties.items.minItems, 1);
  assert.equal(itemSchema.properties.visual, undefined);
  assert.deepEqual(Array.from(itemSchema.required), ["planItemId", "alternatives"]);
  const markSchemeSchema = itemSchema.properties.alternatives.items.properties.markScheme;
  assert.equal(markSchemeSchema.type, "array");
  assert.equal(markSchemeSchema.minItems, 1);
  assert.equal(markSchemeSchema.maxItems, 1);
  assert.equal(schema.properties.items.maxItems, 1);

  const request = {
    items: [{
      planItemId: "P-1",
      questionType: "اختيار من متعدد",
      marks: 1,
      styleTarget: "مفهومي",
      visualTarget: "none",
      sourceReferenceId: "R-1",
      lessonLabel: "1-1 الضغط",
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
  assert.match(capturedBody.contents[0].parts[0].text, /fixedVisual/);
  assert.equal(capturedBody.generationConfig.thinkingConfig.thinkingBudget, 0);
  assert.match(capturedBody.contents[0].parts[0].text, /EV-1-1/);
  assert.deepEqual(Array.from(
    capturedBody.generationConfig.responseJsonSchema.properties.items.prefixItems[0].properties.planItemId.enum,
  ), ["P-1"]);
});

test("يرفض معرف دليل تابعًا لمرجع آخر بدل قبول استناد مزيف", () => {
  const references = [
    { id: "R-1", content: "الضغط هو القوة المؤثرة عموديًا على وحدة المساحة." },
    { id: "R-2", content: "تنتقل الحرارة من الجسم الأعلى حرارة إلى الجسم الأقل حرارة." },
  ];
  const catalog = helpers.buildEvidenceCatalog(references);
  const wrongEvidence = catalog.fragments.find((fragment) => fragment.referenceId === "R-2");
  const request = {
    items: [{ planItemId: "P-1", questionType: "إجابة قصيرة", marks: 1, styleTarget: "مفهومي", visualTarget: "none", sourceReferenceId: "R-1", lessonLabel: "1-1 الضغط" }],
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

test("يقبل السؤال المرتبط بالمرجع الكامل عندما يكون المقطع المختار أضيق ويضعه للمراجعة", () => {
  const references = [{
    id: "R-FULL",
    content: "مقدمة تمهيدية عن تنظيم الدرس وطرائق القياس العامة دون ذكر المفهوم المستهدف. ".repeat(4)
      + "ينشأ الضغط عندما تؤثر قوة عموديًا في مساحة محددة، ويزداد بزيادة القوة ويقل بزيادة المساحة.",
  }];
  const catalog = helpers.buildEvidenceCatalog(references);
  assert.ok(catalog.fragments.length > 1);
  const request = {
    items: [{ planItemId: "P-FULL", questionType: "إجابة قصيرة", marks: 1, styleTarget: "مفهومي", visualTarget: "none", sourceReferenceId: "R-FULL", lessonLabel: "1-1 الضغط" }],
    references,
  };
  const payload = {
    items: [{
      planItemId: "P-FULL",
      alternatives: Array.from({ length: 3 }, () => ({
        stimulus: "",
        text: "عرّف الضغط.",
        options: [],
        answer: "القوة المؤثرة عموديًا في وحدة المساحة.",
        rationale: "يربط التعريف بين القوة والمساحة.",
        markScheme: ["ذكر أن الضغط يرتبط بالقوة المؤثرة في المساحة."],
        questionForm: "مفهومي",
        workingRequired: false,
        sourceEvidenceId: catalog.fragments[0].id,
        enrichmentEvidenceId: "",
        needsReview: false,
      })),
    }],
  };
  const hydrated = helpers.validateAndHydrateGeneratedPayload(payload, request, catalog);
  assert.equal(hydrated.items[0].alternatives[0].needsReview, true);
  assert.equal(hydrated.items[0].alternatives[0].sourceSupport, catalog.fragments[0].text);
});

test("يضيف الخادم نص الدليل نفسه ويضع علامة مراجعة عند ضعف الارتباط اللفظي", () => {
  const references = [{ id: "R-1", content: "الضغط هو القوة المؤثرة عموديًا على وحدة المساحة." }];
  const catalog = helpers.buildEvidenceCatalog(references);
  const request = {
    items: [{ planItemId: "P-1", questionType: "إجابة قصيرة", marks: 1, styleTarget: "مفهومي", visualTarget: "none", sourceReferenceId: "R-1", lessonLabel: "1-1 الضغط" }],
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
  assert.throws(
    () => helpers.validateAndHydrateGeneratedPayload(payload, request, catalog),
    /لا يرتبط بصورة كافية بدليل المرجع/,
  );
});


test("يبني الخادم الرسم الخطي والضغط بصورة حتمية ولا يقبل من Gemini مواصفة رسم", () => {
  const request = {
    subject: "الفيزياء",
    topic: "الضغط",
    references: [{ id: "R-1", content: "يزداد الضغط في السائل بزيادة العمق." }],
  };
  const lineItem = { planItemId: "P-L", visualTarget: "line_graph", sourceReferenceId: "R-1", lessonLabel: "الضغط في السوائل" };
  const pressureItem = { planItemId: "P-P", visualTarget: "pressure_diagram", sourceReferenceId: "R-1", lessonLabel: "الضغط في السوائل" };
  const line = helpers.buildServerOwnedVisualSpec(lineItem, request);
  const pressure = helpers.buildServerOwnedVisualSpec(pressureItem, request);
  assert.equal(line.type, "line_graph");
  assert.equal(line.points.length, 5);
  assert.equal(line.xAxisLabel, "العمق");
  assert.equal(pressure.type, "pressure_diagram");
  assert.deepEqual(Array.from(pressure.labels), ["السائل", "الجسم"]);
  assert.equal(pressure.values.length, 2);
});


test("ينوّع الخادم مواصفات الرسم بين مفردات الضغط دون استدعاء نموذج إضافي", () => {
  const request = {
    subject: "الفيزياء",
    topic: "الضغط",
    references: [{ id: "R-1", content: "يعتمد الضغط على القوة والمساحة ويزداد في السائل بزيادة العمق." }],
  };
  const calculation = helpers.buildServerOwnedVisualSpec({
    planItemId: "P-CALC", visualTarget: "pressure_diagram", sourceReferenceId: "R-1", lessonLabel: "حساب الضغط", styleTarget: "حسابي", cognitiveLevel: "تطبيق",
  }, request);
  const comparison = helpers.buildServerOwnedVisualSpec({
    planItemId: "P-COMP", visualTarget: "pressure_diagram", sourceReferenceId: "R-1", lessonLabel: "الضغط في السوائل", styleTarget: "مقارنة", cognitiveLevel: "استدلال",
  }, request);
  assert.equal(calculation.variant, "force_area");
  assert.equal(comparison.variant, "depth_comparison");
  assert.notEqual(calculation.visualId, comparison.visualId);
  assert.notDeepEqual(Array.from(calculation.annotations), Array.from(comparison.annotations));
});

test("يضبط التفكير والإخراج حسب ثقل المفردة بدل استهلاك مفتوح", () => {
  assert.equal(helpers.generationThinkingBudget([{ questionType: "اختيار من متعدد", cognitiveLevel: "معرفة", marks: 1 }]), 0);
  assert.equal(helpers.generationThinkingBudget([{ questionType: "إجابة طويلة", cognitiveLevel: "استدلال", marks: 3 }]), 768);
  assert.ok(helpers.generationOutputTokenLimit([{ marks: 1 }]) < 7000);
  assert.ok(helpers.generationOutputTokenLimit([{ marks: 4, questionType: "إجابة طويلة" }]) <= 5200);
});

test("يحوّل خانات نموذج التصحيح الثابتة إلى نقطة مستقلة لكل درجة", () => {
  const references = [{ id: "R-1", content: "تنتقل الشحنة الكهربائية بين الأجسام عند الدلك." }];
  const catalog = helpers.buildEvidenceCatalog(references);
  const request = {
    items: [{ planItemId: "P-M", questionType: "إجابة طويلة", marks: 3, styleTarget: "استقصائي", visualTarget: "none", sourceReferenceId: "R-1", lessonLabel: "1-1 الشحنة الكهربائية" }],
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


test("يرفض الأسئلة الوصفية عن الوحدة والكتاب بدل المحتوى العلمي", () => {
  assert.equal(helpers.isMetaSourceQuestion("في أي وحدة دراسية يتناول كتاب الطالب النشاط الإشعاعي؟"), true);
  assert.equal(helpers.isMetaSourceQuestion("فسر سبب عدم استقرار بعض النوى."), false);
});

test("يتحقق من أن دليل السؤال تابع لموضوع الدرس المحدد", () => {
  assert.equal(helpers.referenceSupportsLessonScope("9-1 النشاط الإشعاعي", "النشاط الإشعاعي انبعاث تلقائي من نوى غير مستقرة"), true);
  assert.equal(helpers.referenceSupportsLessonScope("9-1 النشاط الإشعاعي", "الضغط هو القوة المؤثرة على وحدة المساحة"), false);
});


test("يرفض إعادة توليد تنتقل إلى مفهوم آخر رغم صحة المصدر العام", () => {
  const references = [{ id: "R-1", content: "النشاط الإشعاعي هو انبعاث تلقائي من نوى غير مستقرة، وتختلف أنواع الإشعاع في قدرتها على الاختراق." }];
  const catalog = helpers.buildEvidenceCatalog(references);
  const request = {
    items: [{
      planItemId: "P-R", questionType: "إجابة قصيرة", marks: 1, styleTarget: "مفهومي", visualTarget: "none",
      sourceReferenceId: "R-1", lessonLabel: "9-1 النشاط الإشعاعي",
      regenerationAnchor: { stimulus: "", text: "عرّف النشاط الإشعاعي.", answer: "انبعاث تلقائي من نوى غير مستقرة.", questionForm: "مفهومي" },
    }], references,
  };
  const payload = { items: [{ planItemId: "P-R", alternatives: Array.from({ length: 3 }, () => ({
    stimulus: "", text: "اذكر نوعًا من الإشعاع الأعلى قدرة على الاختراق.", options: [], answer: "أشعة جاما.",
    rationale: "تعتمد الإجابة على مقارنة أنواع الإشعاع.", markScheme: { point1: "ذكر أشعة جاما.", point2: "", point3: "", point4: "" },
    questionForm: "مفهومي", workingRequired: false, sourceEvidenceId: catalog.fragments[0].id, needsReview: false,
  })) }] };
  assert.throws(() => helpers.validateAndHydrateGeneratedPayload(payload, request, catalog), /ابتعدت عن مفهوم السؤال المختار/);
});


test("يبني مخططًا موضعيًا يفرض عدد نقاط التصحيح وفق درجة كل مفردة", () => {
  const schema = helpers.generationSchema([
    { planItemId: "P-1", marks: 1 },
    { planItemId: "P-2", marks: 3 },
  ], ["EV-1-1"]);
  const first = schema.properties.items.prefixItems[0];
  const second = schema.properties.items.prefixItems[1];
  const firstMarks = first.properties.alternatives.items.properties.markScheme;
  const secondMarks = second.properties.alternatives.items.properties.markScheme;
  assert.deepEqual(Array.from(first.properties.planItemId.enum), ["P-1"]);
  assert.deepEqual(Array.from(second.properties.planItemId.enum), ["P-2"]);
  assert.equal(firstMarks.minItems, 1);
  assert.equal(firstMarks.maxItems, 1);
  assert.equal(secondMarks.minItems, 3);
  assert.equal(secondMarks.maxItems, 3);
});

test("يصلح نقاط التصحيح بطلب صغير دون إعادة توليد السؤال الكامل", async () => {
  const sourceSupport = "تنتقل الإلكترونات من جسم إلى آخر عند الدلك فتتكون الشحنة الكهربائية ويصبح الجسمان مشحونين.";
  const request = {
    assessmentType: "اختبار قصير رسمي",
    assessmentPolicyId: "oman-science-assessment-2025-2026",
    topic: "الشحنة الكهربائية",
    lessons: ["1-1 الشحنة الكهربائية", "1-2 الكهرباء الساكنة"],
    grade: 10,
    subject: "الفيزياء",
    difficulty: "متوسط",
    references: [{
      id: "R-1", sourceTitle: "كتاب الطالب للفيزياء", sourceKind: "كتاب الطالب",
      pageFrom: 12, pageTo: 12, content: sourceSupport,
    }],
    officialPlanItems: [{
      planItemId: "P-3", questionType: "إجابة طويلة", cognitiveLevel: "استدلال",
      difficultyLevel: "متوسط", marks: 3, sourceReferenceId: "R-1",
      lessonLabel: "1-1 الشحنة الكهربائية", styleTarget: "استقصائي", visualTarget: "none",
    }],
    items: [{
      planItemId: "P-3", questionType: "إجابة طويلة", cognitiveLevel: "استدلال",
      difficultyLevel: "متوسط", marks: 3, sourceReferenceId: "R-1",
      lessonLabel: "1-1 الشحنة الكهربائية", styleTarget: "استقصائي", visualTarget: "none",
    }],
  };
  const alternatives = Array.from({ length: 3 }, (_, index) => ({
    stimulus: "دُلِك جسمان من مادتين مختلفتين ثم قُرّبا من قصاصات ورق.",
    text: `فسّر انتقال الشحنة واقترح ملاحظة تدعم تفسيرك. ${index + 1}`,
    options: [],
    answer: "تنتقل الإلكترونات من جسم إلى آخر فيصبح الجسمان مشحونين، ويظهر أثر الشحنة بانجذاب قصاصات الورق.",
    rationale: "يربط التفسير انتقال الإلكترونات بالملاحظة التجريبية.",
    markScheme: ["ذكر انتقال الإلكترونات."],
    questionForm: "استقصائي",
    workingRequired: false,
    sourceEvidenceId: "EV-1-1",
    needsReview: false,
  }));
  const generated = { items: [{ planItemId: "P-3", alternatives }] };
  let fetchCount = 0;
  let repairBody;
  sandbox.__fetchImpl = async (_url, init) => {
    fetchCount += 1;
    const body = JSON.parse(init.body);
    if (fetchCount === 1) {
      return new Response(JSON.stringify({
        candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(generated) }] } }],
        usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 180 },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    repairBody = body;
    const repaired = {
      schemes: [0, 1, 2].map((alternativeIndex) => ({
        alternativeIndex,
        markScheme: [
          "ذكر انتقال الإلكترونات بين الجسمين.",
          "توضيح اكتساب الجسمين شحنة نتيجة الانتقال.",
          "ربط انجذاب قصاصات الورق بوجود الشحنة.",
        ],
      })),
    };
    return new Response(JSON.stringify({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(repaired) }] } }],
      usageMetadata: { promptTokenCount: 90, candidatesTokenCount: 80 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await helpers.generateAndValidate(request, "WQ-MARK-REPAIR");
  assert.equal(fetchCount, 2);
  assert.equal(result.items[0].alternatives[0].markScheme.length, 3);
  assert.deepEqual(Array.from(result.items[0].alternatives[0].markScheme), [
    "ذكر انتقال الإلكترونات بين الجسمين.",
    "توضيح اكتساب الجسمين شحنة نتيجة الانتقال.",
    "ربط انجذاب قصاصات الورق بوجود الشحنة.",
  ]);
  assert.equal(repairBody.generationConfig.thinkingConfig.thinkingBudget, 0);
  assert.equal(repairBody.generationConfig.responseJsonSchema.properties.schemes.prefixItems[0].properties.markScheme.minItems, 3);
  assert.doesNotMatch(repairBody.contents[0].parts[0].text, /evidenceFragments|officialPlanSummary/);
});

test("يحفظ السؤال ويضعه للمراجعة إذا تعذر طلب إصلاح نقاط التصحيح", async () => {
  const request = {
    assessmentType: "اختبار قصير رسمي",
    assessmentPolicyId: "oman-science-assessment-2025-2026",
    topic: "الضغط",
    lessons: ["1-1 الضغط", "1-2 الضغط في السوائل"],
    grade: 10,
    subject: "الفيزياء",
    difficulty: "متوسط",
    references: [{
      id: "R-1", sourceTitle: "كتاب الطالب للفيزياء", sourceKind: "كتاب الطالب",
      pageFrom: 20, pageTo: 20, content: "الضغط هو القوة المؤثرة عموديًا على وحدة المساحة.",
    }],
    officialPlanItems: [{
      planItemId: "P-2", questionType: "إجابة قصيرة", cognitiveLevel: "تطبيق",
      difficultyLevel: "متوسط", marks: 2, sourceReferenceId: "R-1",
      lessonLabel: "1-1 الضغط", styleTarget: "سياقي", visualTarget: "none",
    }],
    items: [{
      planItemId: "P-2", questionType: "إجابة قصيرة", cognitiveLevel: "تطبيق",
      difficultyLevel: "متوسط", marks: 2, sourceReferenceId: "R-1",
      lessonLabel: "1-1 الضغط", styleTarget: "سياقي", visualTarget: "none",
    }],
  };
  const generated = { items: [{ planItemId: "P-2", alternatives: Array.from({ length: 3 }, (_, index) => ({
    stimulus: "يؤثر جسم بقوة عمودية في سطح معلوم المساحة.",
    text: `فسّر كيف يمكن زيادة الضغط المؤثر في السطح. ${index + 1}`,
    options: [],
    answer: "يزداد الضغط بزيادة القوة أو بتقليل مساحة التلامس.",
    rationale: "لأن الضغط يساوي القوة العمودية مقسومة على المساحة.",
    markScheme: ["ذكر زيادة القوة."],
    questionForm: "سياقي",
    workingRequired: false,
    sourceEvidenceId: "EV-1-1",
    needsReview: false,
  })) }] };
  let fetchCount = 0;
  sandbox.__fetchImpl = async () => {
    fetchCount += 1;
    if (fetchCount === 1) {
      return new Response(JSON.stringify({
        candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(generated) }] } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: { message: "temporary repair failure" } }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await helpers.generateAndValidate(request, "WQ-MARK-FALLBACK");
  assert.equal(fetchCount, 2);
  assert.equal(result.items[0].alternatives[0].markScheme.length, 2);
  assert.equal(result.items[0].alternatives[0].needsReview, true);
});

test("يبني الخادم جداول وأجهزة قياس وأشعة وقوى وعمليات دون استدعاء مولد صور", () => {
  const baseRequest = {
    subject: "الفيزياء",
    topic: "مرئيات علمية",
    references: [{
      id: "R-VIS", sourceId: "S", sourceTitle: "كتاب الطالب", sourceKind: "كتاب الطالب",
      pageFrom: 1, pageTo: 1, content: "بيانات علمية موثقة.", lessonTopic: "درس", lessonScopeMode: "page-range",
      lessonPageFrom: 1, lessonPageTo: 1,
    }],
  };
  const build = (visualTarget, lessonLabel, styleTarget = "بيانات") => helpers.buildServerOwnedVisualSpec({
    planItemId: `P-${visualTarget}`,
    questionType: "إجابة قصيرة",
    cognitiveLevel: "تطبيق",
    marks: 2,
    sourceReferenceId: "R-VIS",
    lessonLabel,
    styleTarget,
    visualTarget,
  }, { ...baseRequest, topic: lessonLabel });

  const table = build("data_table", "جدول نتائج قياسات الجهد والتيار");
  const instrument = build("instrument_scale", "قراءة تدريج ميزان الحرارة");
  const ray = build("ray_diagram", "انعكاس الضوء عند مرآة");
  const force = build("force_diagram", "القوى المؤثرة في جسم");
  const flow = build("flow_diagram", "مراحل تحول الطاقة");

  assert.equal(table.tableColumns.length, 2);
  assert.equal(table.tableCells.length, 5);
  assert.equal(instrument.values.length, 4);
  assert.equal(ray.variant, "reflection");
  assert.ok(force.vectors.length >= 2);
  assert.ok(flow.labels.length >= 3);
});


test("تمرر المحاولة الثانية سبب رفض stimulus بدل إعادة التوليد بتوجيه عام", async () => {
  const request = {
    assessmentType: "اختبار قصير رسمي",
    assessmentPolicyId: "oman-science-assessment-2025-2026",
    topic: "الضغط",
    lessons: ["1-1 الضغط", "1-2 الضغط في السوائل"],
    grade: 10,
    subject: "الفيزياء",
    difficulty: "متوسط",
    trustedEnrichmentEnabled: false,
    references: [{
      id: "R-CONTEXT", sourceId: "S", sourceTitle: "كتاب الطالب", sourceKind: "كتاب الطالب",
      pageFrom: 20, pageTo: 20, content: "الضغط يساوي القوة المؤثرة عموديًا مقسومة على مساحة السطح.",
      lessonTopic: "1-1 الضغط", lessonScopeMode: "page-range", lessonPageFrom: 20, lessonPageTo: 20,
    }],
    officialPlanItems: [{
      planItemId: "P-CONTEXT", questionType: "إجابة قصيرة", cognitiveLevel: "تطبيق",
      marks: 1, sourceReferenceId: "R-CONTEXT", lessonLabel: "1-1 الضغط",
      styleTarget: "سياقي", visualTarget: "none",
    }],
    items: [{
      planItemId: "P-CONTEXT", questionType: "إجابة قصيرة", cognitiveLevel: "تطبيق",
      marks: 1, sourceReferenceId: "R-CONTEXT", lessonLabel: "1-1 الضغط",
      styleTarget: "سياقي", visualTarget: "none",
    }],
  };
  const alternatives = (valid) => Array.from({ length: 3 }, (_, index) => ({
    stimulus: valid ? "يؤثر جسم بالقوة نفسها على سطحين مختلفي المساحة." : "",
    text: valid ? `فسر لماذا يكون الضغط أكبر على السطح الأصغر. ${index + 1}` : "فسر النتيجة.",
    options: [],
    answer: "لأن الضغط يزداد عندما تقل مساحة السطح عند ثبات القوة.",
    rationale: "الضغط يساوي القوة مقسومة على المساحة.",
    markScheme: ["ربط زيادة الضغط بنقصان مساحة السطح عند ثبات القوة."],
    questionForm: "سياقي",
    workingRequired: false,
    sourceEvidenceId: "EV-1-1",
    enrichmentEvidenceId: "",
    needsReview: false,
  }));
  let fetchCount = 0;
  let secondPrompt = null;
  sandbox.__fetchImpl = async (_url, init) => {
    fetchCount += 1;
    const body = JSON.parse(init.body);
    if (fetchCount === 2) secondPrompt = JSON.parse(body.contents[0].parts[0].text);
    const payload = { items: [{ planItemId: "P-CONTEXT", alternatives: alternatives(fetchCount > 1) }] };
    return new Response(JSON.stringify({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(payload) }] } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await helpers.generateAndValidate(request, "WQ-CONTEXT-REPAIR");
  assert.equal(fetchCount, 2);
  assert.match(secondPrompt.previousValidationError, /لا يحتوي متنًا أو بيانات كافية/);
  assert.match(result.items[0].alternatives[0].stimulus, /سطحين مختلفي المساحة/);
});

test("يقصر الصور الحرة على مشاهد سياقية آمنة ويمنع الرسوم الحسابية", () => {
  assert.equal(helpers.isControlledIllustrationEligible({ type: "electrostatic_diagram", variant: "charge_transfer", role: "interpret" }), true);
  assert.equal(helpers.isControlledIllustrationEligible({ type: "pressure_diagram", variant: "submerged_object", role: "read" }), true);
  assert.equal(helpers.isControlledIllustrationEligible({ type: "force_diagram", variant: "free_body", role: "calculate" }), false);
  assert.equal(helpers.isControlledIllustrationEligible({ type: "electrostatic_diagram", variant: "electric_field", role: "interpret" }), false);
});

test("يبني مطالبة صورة 2D بلا نصوص أو أرقام أو أسهم", () => {
  const request = {
    action: "generate_visual_illustration",
    draftId: "draft-1",
    planItemId: "plan-1",
    grade: 10,
    subject: "الفيزياء",
    lessonLabel: "الشحنة الكهربائية",
    questionText: "بالاعتماد على الشكل استنتج أثر دلك المسطرة.",
    sourceSupport: "تكتسب المسطرة شحنة عند دلكها بقطعة قماش وتنجذب إليها قصاصات الورق.",
    previousAssetPath: "",
    visual: { type: "electrostatic_diagram", variant: "charge_transfer", role: "interpret", title: "شحن جسم بالدلك", altText: "مسطرة وقماش وقصاصات ورق" },
  };
  const prompt = helpers.buildControlledIllustrationPrompt(request);
  assert.match(prompt, /2D educational textbook illustration/);
  assert.match(prompt, /no words, no letters, no numbers, no units, no arrows/);
  assert.match(prompt, /Do not show plus or minus charge symbols/);
  assert.match(prompt, /landscape 4:3/);
});

test("يقرأ صورة Gemini المضمنة ويتجاهل الأجزاء النصية", () => {
  const found = helpers.findGeneratedImagePart({
    candidates: [{ content: { parts: [{ text: "done" }, { inlineData: { mimeType: "image/png", data: "A".repeat(1200) } }] } }],
  });
  assert.equal(found.mimeType, "image/png");
  assert.equal(found.data.length, 1200);
  assert.equal(helpers.findGeneratedImagePart({ candidates: [{ content: { parts: [{ text: "no image" }] } }] }), null);
});

test("يفرض القيم العددية على الرسوم الحسابية قبل قبول السؤال", () => {
  assert.equal(helpers.fixedVisualContainsCalculationData({
    type: "force_diagram", role: "calculate", vectors: [
      { magnitude: 8, dx: 1, dy: 0 },
      { magnitude: 6, dx: -1, dy: 0 },
    ],
  }), true);
  assert.equal(helpers.fixedVisualContainsCalculationData({ type: "force_diagram", role: "calculate", vectors: [] }), false);
  assert.equal(helpers.fixedVisualContainsCalculationData({ type: "pressure_diagram", variant: "force_area", role: "calculate", values: [80, 0.02] }), true);
  assert.equal(helpers.fixedVisualContainsCalculationData({ type: "pressure_diagram", variant: "force_area", role: "calculate", values: [80, 0] }), false);
});
