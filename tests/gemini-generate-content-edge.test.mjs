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
    buildServerOwnedScientificItem,
    buildServerOwnedScenarioContract,
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
    calculationPromptContainsRequiredData,
    normalizeVisualQuestionReference,
    sanitizeGeneratedDisplayText,
    validateVisualSemanticBinding,
    validateAssessmentQuality,
    buildMomentValidationCorpus,
    generationItemHasMomentConcept,
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
  const itemSchema = schema.properties.items.items;
  assert.equal(itemSchema.properties.planItemId.type, "string");
  assert.equal(itemSchema.properties.alternatives.type, "array");
  assert.equal(itemSchema.properties.visual, undefined);
  assert.deepEqual(Array.from(itemSchema.required), ["planItemId", "alternatives"]);
  const markSchemeSchema = itemSchema.properties.alternatives.items.properties.markScheme;
  assert.equal(markSchemeSchema.type, "array");
  assert.equal(markSchemeSchema.items.type, "string");
  assert.equal(schema.properties.items.prefixItems, undefined);
  assert.equal(schema.properties.items.minItems, undefined);
  assert.equal(schema.properties.items.maxItems, undefined);

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
  assert.equal(
    capturedBody.generationConfig.responseJsonSchema.properties.items.items.properties.planItemId.type,
    "string",
  );
  assert.equal(capturedBody.generationConfig.responseJsonSchema.properties.items.prefixItems, undefined);
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
  const itemSchema = schema.properties.items.items;
  const markScheme = itemSchema.properties.alternatives.items.properties.markScheme;
  assert.equal(itemSchema.properties.planItemId.type, "string");
  assert.equal(markScheme.type, "array");
  assert.equal(markScheme.items.type, "string");
  assert.equal(schema.properties.items.prefixItems, undefined);
  assert.equal(markScheme.minItems, undefined);
  assert.equal(markScheme.maxItems, undefined);
});

test("يطبع الخادم نقاط التصحيح محليًا دون استدعاء Gemini مرة ثانية", async () => {
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
    sourceEvidenceId: "EV-1-1",
    enrichmentEvidenceId: "",
    needsReview: false,
  }));
  const generated = { items: [{ planItemId: "P-3", alternatives }] };
  let fetchCount = 0;
  sandbox.__fetchImpl = async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(generated) }] } }],
      usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 180 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await helpers.generateAndValidate(request, "WQ-MARK-LOCAL");
  assert.equal(fetchCount, 1);
  assert.equal(result.items[0].alternatives[0].markScheme.length, 3);
  assert.equal(result.items[0].alternatives[0].needsReview, true);
  assert.match(result.items[0].alternatives[0].markScheme.join(" "), /الإلكترونات|الملاحظة|الشحنة/u);
});

test("يحافظ على السؤال ويكمل نقاط التصحيح محليًا عند نقصها", async () => {
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
    sourceEvidenceId: "EV-1-1",
    enrichmentEvidenceId: "",
    needsReview: false,
  })) }] };
  let fetchCount = 0;
  sandbox.__fetchImpl = async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(generated) }] } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await helpers.generateAndValidate(request, "WQ-MARK-FALLBACK");
  assert.equal(fetchCount, 1);
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

test("يقصر الصور الحرة على المشاهد الآمنة ويسمح لمخطط القوى بأصل 2D منضبط فقط", () => {
  assert.equal(helpers.isControlledIllustrationEligible({ type: "electrostatic_diagram", variant: "charge_transfer", role: "interpret" }), true);
  assert.equal(helpers.isControlledIllustrationEligible({ type: "pressure_diagram", variant: "submerged_object", role: "read" }), true);
  assert.equal(helpers.isControlledIllustrationEligible({ type: "force_diagram", variant: "free_body", role: "calculate" }), true);
  assert.equal(helpers.isControlledIllustrationEligible({ type: "force_diagram", variant: "moments", role: "calculate" }), false);
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

test("يقبل القيم والوحدات الموزعة بين نص السؤال والرسم الحسابي", () => {
  const visual = {
    ...noVisual(),
    type: "data_table",
    role: "calculate",
    tableColumns: ["الحالة", "العدد"],
    tableRows: ["1", "2"],
    tableCells: [["1", "20"], ["2", "30"]],
    hiddenCells: [],
    vectors: [],
    values: [],
  };
  assert.equal(helpers.calculationPromptContainsRequiredData({
    stimulus: "شحنة جسم تساوي 3.2 × 10^-18 C وشحنة الإلكترون 1.6 × 10^-19 C.",
    text: "احسب عدد الإلكترونات.",
  }, visual), true);
});

test("يبني الخادم نموذج القوة الحرة بقوة مؤثرة واحتكاك حقيقيين لا بتصنيف موضعي خاطئ", () => {
  const request = { subject: "الفيزياء", topic: "القوة والاحتكاك", references: [], items: [], officialPlanItems: [] };
  const item = {
    planItemId: "P-FORCE",
    questionType: "إجابة قصيرة",
    cognitiveLevel: "تطبيق",
    marks: 2,
    sourceReferenceId: "R-1",
    lessonLabel: "الاحتكاك والقوة المحصلة",
    outcomeLabel: "يحسب القوة المحصلة في وجود الاحتكاك",
    styleTarget: "حسابي",
    visualTarget: "force_diagram",
    scenarioTarget: "shopping_trolley",
    stimulusTarget: "real_life_scene",
    skillTarget: "calculate",
    diversityKey: "force:trolley",
  };
  const visual = helpers.buildServerOwnedVisualSpec(item, request);
  const model = helpers.buildServerOwnedScientificItem(item, request, visual);
  assert.equal(model.kind, "force_system");
  const kinds = model.quantities.map((quantity) => quantity.kind);
  assert.ok(kinds.includes("applied_force"));
  assert.ok(kinds.includes("friction_force"));
  assert.equal(model.quantities.find((quantity) => quantity.kind === "weight")?.label, "الوزن");
});

test("يبني الخادم نموذج عزم مستقلًا ولا يخلطه بنموذج القوة والاحتكاك", () => {
  const request = {
    subject: "الفيزياء",
    topic: "عزم القوة",
    references: [],
    items: [],
    officialPlanItems: [],
  };
  const item = {
    planItemId: "P-MOMENT",
    questionType: "إجابة قصيرة",
    cognitiveLevel: "تطبيق",
    marks: 2,
    sourceReferenceId: "R-1",
    lessonLabel: "عزم القوة",
    outcomeLabel: "يحسب عزم قوة حول محور دوران",
    styleTarget: "حسابي",
    visualTarget: "force_diagram",
    scenarioTarget: "door_handle",
    stimulusTarget: "real_life_scene",
    skillTarget: "calculate",
    diversityKey: "moment:door",
  };
  const visual = helpers.buildServerOwnedVisualSpec(item, request);
  const model = helpers.buildServerOwnedScientificItem(item, request, visual);
  assert.equal(visual.variant, "moments");
  assert.equal(model.kind, "moment_system");
  assert.equal(model.relationship, "moment");
  assert.ok(model.quantities.some((quantity) => quantity.kind === "moment_force"));
  assert.ok(model.quantities.some((quantity) => quantity.kind === "lever_arm"));
  assert.equal(model.quantities.some((quantity) => quantity.kind === "friction_force"), false);
  assert.equal(model.resultUnit, "N m");
});

test("يبني الخادم عقد السياق من متن السؤال ولا يطلبه من Gemini", () => {
  const alternative = {
    stimulus: "يفتح طالب باب المختبر بالضغط على المقبض البعيد عن المفصل.",
    text: "باستخدام الشكل المرفق، فسّر لماذا يسهل فتح الباب عند هذا الموضع.",
    options: [], answer: "", rationale: "", markScheme: [], sourceEvidenceId: "", enrichmentEvidenceId: "", needsReview: false,
  };
  const visual = {
    ...noVisual(),
    type: "force_diagram",
    variant: "moments",
    purpose: "توضيح أثر ذراع القوة في عزم الباب",
    title: "عزم الباب",
    altText: "باب يدور حول المفصل وتؤثر القوة عند المقبض",
  };
  const contract = helpers.buildServerOwnedScenarioContract(alternative, "door_handle", "real_life_scene", "تفسير أثر ذراع القوة في العزم", visual);
  assert.equal(contract.target, "door_handle");
  assert.equal(contract.contextIsEssential, true);
  assert.ok(contract.evidencePhrases.length >= 2);
  const material = `${alternative.stimulus} ${alternative.text}`;
  assert.ok(contract.evidencePhrases.every((phrase) => material.includes(phrase)));
});

test("يشترط مسافة الدوران في سؤال العزم حتى لو ظهرت القوتان في الرسم", () => {
  const visual = {
    ...noVisual(),
    type: "force_diagram",
    variant: "moments",
    role: "calculate",
    tableColumns: [], tableRows: [], tableCells: [], hiddenCells: [], values: [],
    vectors: [
      { label: "قوة 1", magnitude: 12, dx: 0, dy: -1 },
      { label: "قوة 2", magnitude: 9, dx: 0, dy: -1 },
    ],
  };
  assert.equal(helpers.calculationPromptContainsRequiredData({ stimulus: "", text: "احسب العزم حول نقطة الارتكاز." }, visual), false);
  assert.equal(helpers.calculationPromptContainsRequiredData({ stimulus: "تبعد القوة الأولى 2.0 m عن نقطة الارتكاز.", text: "احسب العزم حول نقطة الارتكاز." }, visual), true);
});


test("يقبل سؤال العزم الحياتي عندما يوفر الشكل المرفق دليل الارتكاز وذراع القوة دون تكراره حرفيًا في النص", () => {
  const visual = {
    ...noVisual(),
    type: "force_diagram",
    variant: "moments",
    role: "calculate",
    title: "قوتان حول نقطة ارتكاز",
    purpose: "حساب ومقارنة عزوم قوتين حول نقطة ارتكاز",
    altText: "عارضة حول نقطة ارتكاز تظهر عليها قوتان مع مقدار كل قوة والمسافة العمودية عن محور الدوران",
    annotations: ["بعد القوة 1 عن الارتكاز = 1.5 m", "بعد القوة 2 عن الارتكاز = 1.0 m"],
    labels: ["الجسم"],
    tableColumns: [], tableRows: [], tableCells: [], hiddenCells: [], values: [1.5, 1.0],
    vectors: [
      { label: "قوة 1", magnitude: 120, dx: 0, dy: -85 },
      { label: "قوة 2", magnitude: 80, dx: 0, dy: -65 },
    ],
  };
  const scientificItem = {
    version: "scientific-item-v1",
    kind: "force_system",
    phenomenon: "القوى والعزم",
    primaryEntity: "باب بمقبض",
    secondaryEntity: "سطح ثابت",
    visualObject: "باب بمقبض",
    relationship: "resultant_force",
    primaryCharge: "unknown",
    secondaryCharge: "unknown",
    transferredParticle: "",
    quantities: [
      { kind: "applied_force", label: "قوة 1", value: 120, unit: "N", direction: "up" },
      { kind: "applied_force", label: "قوة 2", value: 80, unit: "N", direction: "up" },
    ],
    resultValue: 0,
    resultUnit: "N m",
    resultDirection: "none",
    expectedResult: "يزداد عزم الدوران عندما تؤثر القوة أبعد عن مفصل الباب.",
  };
  assert.doesNotThrow(() => helpers.validateAssessmentQuality(
    {
      stimulus: "يحاول طالب فتح باب المدرسة من خلال الضغط على المقبض كما في الشكل المرفق.",
      text: "باستخدام الشكل المرفق، برر لماذا يكون عزم الدوران أكبر عندما تؤثر القوة على المقبض البعيد.",
      options: [], answer: "لأن ذراع القوة أكبر.", rationale: "زيادة البعد عن المفصل تزيد العزم.",
      markScheme: ["ربط زيادة العزم بزيادة ذراع القوة."], sourceEvidenceId: "", enrichmentEvidenceId: "", needsReview: false,
    },
    "door_handle",
    "real_life_scene",
    "evaluate",
    "modern:moment-side-view",
    visual,
    scientificItem,
  ));
});

test("يبقي سؤال العزم مرفوضًا عندما يغيب الدعم من النص والشكل معًا", () => {
  const visual = {
    ...noVisual(),
    type: "force_diagram",
    variant: "free_body",
    role: "calculate",
    title: "مخطط قوى",
    purpose: "تحليل قوى عامة",
    altText: "جسم تظهر عليه أسهم قوى عامة",
    annotations: ["اتجاه السهم يبين اتجاه القوة"],
    labels: ["الجسم"],
    tableColumns: [], tableRows: [], tableCells: [], hiddenCells: [], values: [],
    vectors: [{ label: "القوة المؤثرة", magnitude: 5, dx: 1, dy: 0 }],
  };
  const scientificItem = {
    version: "scientific-item-v1",
    kind: "generic",
    phenomenon: "العزم",
    primaryEntity: "باب",
    secondaryEntity: "",
    visualObject: "باب",
    relationship: "none",
    primaryCharge: "unknown",
    secondaryCharge: "unknown",
    transferredParticle: "",
    quantities: [],
    resultValue: 0,
    resultUnit: "",
    resultDirection: "none",
    expectedResult: "",
  };
  assert.throws(() => helpers.validateAssessmentQuality(
    {
      stimulus: "في موقف يومي عند استخدام باب.",
      text: "فسر أثر العزم في هذا الموقف.",
      options: [], answer: "", rationale: "", markScheme: [""], sourceEvidenceId: "", enrichmentEvidenceId: "", needsReview: false,
    },
    "door_handle",
    "real_life_scene",
    "evaluate",
    "modern:moment-bad",
    visual,
    scientificItem,
  ), /سؤال العزم في الموقف الحياتي لا يحدد محور الدوران/);
});

test("يصحح الخادم workingRequired تلقائيًا للسؤال الحسابي متعدد الدرجات", () => {
  const references = [{
    id: "R-WORK-2", sourceId: "student-book", sourceTitle: "كتاب الطالب", sourceKind: "كتاب الطالب",
    pageFrom: 10, pageTo: 10, content: "ينص قانون نيوتن الثاني على أن القوة تساوي الكتلة مضروبة في التسارع.",
    lessonTopic: "القوة والتسارع", lessonScopeMode: "page-range", lessonPageFrom: 10, lessonPageTo: 10,
  }];
  const catalog = helpers.buildEvidenceCatalog(references);
  const request = {
    generationMode: "whole_exam_v2", subject: "الفيزياء", topic: "القوة والتسارع", references,
    items: [{
      planItemId: "P-WORK-2", questionType: "إجابة قصيرة", marks: 2, sourceReferenceId: "R-WORK-2",
      lessonLabel: "القوة والتسارع", styleTarget: "حسابي", visualTarget: "none",
      scenarioTarget: "scientific_abstract", stimulusTarget: "concise_text", skillTarget: "calculate",
      diversityKey: "legacy:work-2",
    }],
  };
  const payload = { items: [{
    planItemId: "P-WORK-2", alternatives: [{
      stimulus: "تؤثر قوة مقدارها 12 N في جسم كتلته 3 kg.", text: "احسب تسارع الجسم.", options: [],
      answer: "4 m/s²", rationale: "التسارع يساوي القوة مقسومة على الكتلة.",
      markScheme: ["استخدام العلاقة F = ma.", "التعويض وإيجاد 4 m/s²."],
      questionForm: "حسابي", workingRequired: false, sourceEvidenceId: catalog.fragments[0].id,
      enrichmentEvidenceId: "", needsReview: false,
    }],
  }] };
  const hydrated = helpers.validateAndHydrateGeneratedPayload(payload, request, catalog);
  assert.equal(hydrated.items[0].alternatives[0].workingRequired, true);
});

test("لا يفرض الخادم خطوات الحل على السؤال الحسابي ذي الدرجة الواحدة", () => {
  const references = [{
    id: "R-WORK-1", sourceId: "student-book", sourceTitle: "كتاب الطالب", sourceKind: "كتاب الطالب",
    pageFrom: 20, pageTo: 20, content: "عزم القوة يساوي القوة مضروبة في البعد العمودي عن محور الدوران.",
    lessonTopic: "عزم القوة", lessonScopeMode: "page-range", lessonPageFrom: 20, lessonPageTo: 20,
  }];
  const catalog = helpers.buildEvidenceCatalog(references);
  const request = {
    generationMode: "whole_exam_v2", subject: "الفيزياء", topic: "عزم القوة", references,
    items: [{
      planItemId: "P-WORK-1", questionType: "إجابة قصيرة", marks: 1, sourceReferenceId: "R-WORK-1",
      lessonLabel: "عزم القوة", styleTarget: "حسابي", visualTarget: "none",
      scenarioTarget: "scientific_abstract", stimulusTarget: "concise_text", skillTarget: "calculate",
      diversityKey: "legacy:work-1",
    }],
  };
  const payload = { items: [{
    planItemId: "P-WORK-1", alternatives: [{
      stimulus: "تؤثر قوة مقدارها 5 N على بعد عمودي 2 m من محور الدوران.", text: "احسب عزم القوة.", options: [],
      answer: "10 N m", rationale: "العزم يساوي القوة في البعد العمودي.", markScheme: ["حساب 10 N m."],
      questionForm: "حسابي", workingRequired: true, sourceEvidenceId: catalog.fragments[0].id,
      enrichmentEvidenceId: "", needsReview: false,
    }],
  }] };
  const hydrated = helpers.validateAndHydrateGeneratedPayload(payload, request, catalog);
  assert.equal(hydrated.items[0].alternatives[0].workingRequired, false);
});

test("يطبّع إحالة الشكل داخل مسار التحقق الفعلي بدل رفض السؤال البصري", () => {
  const references = [{
    id: "R-VISUAL-REF", sourceId: "student-book", sourceTitle: "كتاب الطالب", sourceKind: "كتاب الطالب",
    pageFrom: 30, pageTo: 30, content: "تؤثر القوى في حركة الجسم، وتحدد المحصلة من اتجاهات القوى ومقاديرها.",
    lessonTopic: "القوى والمحصلة", lessonScopeMode: "page-range", lessonPageFrom: 30, lessonPageTo: 30,
  }];
  const catalog = helpers.buildEvidenceCatalog(references);
  const request = {
    generationMode: "whole_exam_v2", subject: "الفيزياء", topic: "القوى والمحصلة", references,
    items: [{
      planItemId: "P-VISUAL-REF", questionType: "إجابة قصيرة", marks: 2, sourceReferenceId: "R-VISUAL-REF",
      lessonLabel: "القوى والمحصلة", styleTarget: "حسابي", visualTarget: "force_diagram",
      scenarioTarget: "scientific_abstract", stimulusTarget: "scientific_diagram", skillTarget: "calculate",
      diversityKey: "legacy:visual-reference",
    }],
  };
  const payload = { items: [{
    planItemId: "P-VISUAL-REF", alternatives: [{
      stimulus: "", text: "احسب محصلة القوتين واتجاهها.", options: [],
      answer: "2 N في اتجاه القوة الأكبر.", rationale: "تطرح القوتان المتعاكستان.",
      markScheme: ["طرح مقدار القوتين.", "تحديد اتجاه القوة الأكبر."],
      questionForm: "حسابي", workingRequired: false, sourceEvidenceId: catalog.fragments[0].id,
      enrichmentEvidenceId: "", needsReview: false,
    }],
  }] };
  const hydrated = helpers.validateAndHydrateGeneratedPayload(payload, request, catalog);
  assert.equal(
    hydrated.items[0].alternatives[0].text,
    "بالاستعانة بمخطط القوى المرفق، احسب محصلة القوتين واتجاهها.",
  );
  assert.equal(hydrated.items[0].alternatives[0].workingRequired, true);
});

test("يختار مطبع الإحالة عبارة مناسبة لكل نوع رسم ولا يكررها", () => {
  const force = helpers.normalizeVisualQuestionReference("", "احسب محصلة القوتين.", "force_diagram");
  assert.equal(force.text, "بالاستعانة بمخطط القوى المرفق، احسب محصلة القوتين.");
  assert.equal(force.changed, true);

  const table = helpers.normalizeVisualQuestionReference("", "قارن بين القيمتين.", "data_table");
  assert.equal(table.text, "بالاستعانة بالجدول المرفق، قارن بين القيمتين.");

  const graph = helpers.normalizeVisualQuestionReference("", "استنتج اتجاه العلاقة.", "line_graph");
  assert.equal(graph.text, "بالاستعانة بالرسم البياني المرفق، استنتج اتجاه العلاقة.");

  const existing = helpers.normalizeVisualQuestionReference(
    "يعرض الرَّسم البياني المرفق نتائج التجربة.",
    "استنتج العلاقة.",
    "line_graph",
  );
  assert.equal(existing.changed, false);
  assert.equal(existing.text, "استنتج العلاقة.");

  const plain = helpers.normalizeVisualQuestionReference("", "عرّف القوة.", "none");
  assert.equal(plain.changed, false);
  assert.equal(plain.text, "عرّف القوة.");
});


test("يبني جدول الموصلات من هدف التعلم لا من كلمة الكهرباء العامة", () => {
  const item = {
    planItemId: "P-CONDUCTOR", questionType: "إجابة قصيرة", cognitiveLevel: "تطبيق", marks: 1,
    sourceReferenceId: "R-CONDUCTOR", lessonLabel: "الموصلات والعوازل",
    outcomeLabel: "يصنف مواد مختلفة إلى موصلات وعوازل من نتيجة مرور التيار",
    styleTarget: "بيانات", visualTarget: "data_table", scenarioTarget: "laboratory_setup",
    stimulusTarget: "data_table", skillTarget: "interpret", diversityKey: "visual-plan-4",
  };
  const request = {
    generationMode: "whole_exam_v2", subject: "الفيزياء", topic: "الكهرباء",
    references: [{ id: "R-CONDUCTOR", content: "النحاس موصل جيد بينما البلاستيك عازل.", lessonTopic: "الموصلات والعوازل" }],
  };
  const visual = helpers.buildServerOwnedVisualSpec(item, request);
  assert.equal(visual.type, "data_table");
  assert.match(visual.title, /التوصيل الكهربائي/);
  assert.deepEqual([...visual.tableColumns], ["المادة", "نتيجة اختبار مرور التيار"]);
  assert.match(visual.tableCells.flat().join(" "), /النحاس|الحديد/);
});

test("يرفض جدولًا لا تتعامل معه صياغة السؤال أو إجابته", () => {
  const references = [{
    id: "R-BIND", sourceId: "student-book", sourceTitle: "كتاب الطالب", sourceKind: "كتاب الطالب",
    pageFrom: 10, pageTo: 10, content: "النحاس والألومنيوم موصلان للكهرباء، والبلاستيك والخشب عازلان.",
    lessonTopic: "الموصلات والعوازل", lessonScopeMode: "page-range", lessonPageFrom: 10, lessonPageTo: 10,
  }];
  const catalog = helpers.buildEvidenceCatalog(references);
  const request = {
    generationMode: "whole_exam_v2", subject: "الفيزياء", topic: "الكهرباء", references,
    items: [{
      planItemId: "P-BIND", questionType: "إجابة قصيرة", cognitiveLevel: "تطبيق", marks: 1,
      sourceReferenceId: "R-BIND", lessonLabel: "الموصلات والعوازل",
      outcomeLabel: "يصنف مواد مختلفة إلى موصلات وعوازل من نتيجة مرور التيار",
      styleTarget: "بيانات", visualTarget: "data_table", scenarioTarget: "laboratory_setup",
      stimulusTarget: "data_table", skillTarget: "interpret", diversityKey: "visual-plan-4",
    }],
  };
  const payload = { items: [{
    planItemId: "P-BIND", alternatives: [{
      stimulus: "", text: "بالاستعانة بالجدول المرفق، احسب عدد الإلكترونات التي اكتسبها بالون مشحون.",
      options: [], answer: "20 إلكترونًا", rationale: "تقسم شحنة الجسم على شحنة الإلكترون.",
      markScheme: ["حساب عدد الإلكترونات."], questionForm: "بيانات", workingRequired: false,
      sourceEvidenceId: catalog.fragments[0].id, enrichmentEvidenceId: "", needsReview: false,
    }],
  }] };
  assert.throws(
    () => helpers.validateAndHydrateGeneratedPayload(payload, request, catalog),
    /سؤال عدد الإلكترونات يحتاج بيانات شحنة الجسم وشحنة الإلكترون|لا يستخدم معنى أعمدة الجدول أو بياناته/,
  );
});

test("ينظف معرف visual-plan داخل مسار Edge قبل إرجاع السؤال", () => {
  assert.equal(
    helpers.sanitizeGeneratedDisplayText("يوضح الشكل (visual-plan-5) شحن جسم بالدلك."),
    "يوضح الشكل شحن جسم بالدلك.",
  );
});

test("يضع محركًا فعليًا في دائرة سياق العربة الكهربائية", () => {
  const item = {
    planItemId: "P-MOTOR", questionType: "إجابة قصيرة", cognitiveLevel: "استدلال", marks: 2,
    sourceReferenceId: "R-MOTOR", lessonLabel: "الدوائر الكهربائية",
    outcomeLabel: "يقيم دائرة تحكم في محرك عربة كهربائية ويقترح تحسينًا",
    styleTarget: "استقصائي", visualTarget: "circuit_diagram", scenarioTarget: "shopping_trolley",
    stimulusTarget: "decision_case", skillTarget: "evaluate", diversityKey: "visual-plan-5",
  };
  const request = {
    generationMode: "whole_exam_v2", subject: "الفيزياء", topic: "الدوائر الكهربائية",
    references: [{ id: "R-MOTOR", content: "يستخدم المحرك الكهربائي في تحويل الطاقة الكهربائية إلى حركة.", lessonTopic: "الدوائر الكهربائية" }],
  };
  const visual = helpers.buildServerOwnedVisualSpec(item, request);
  assert.equal(visual.type, "circuit_diagram");
  assert.equal(visual.components.includes("motor"), true);
  assert.match(visual.altText, /محرك/);
});

test("يثبت المشهد السياقي للعزم المحور وذراع القوة وموضع التأثير", () => {
  const item = {
    planItemId: "P-MOMENT-CONTEXT",
    questionType: "إجابة قصيرة",
    cognitiveLevel: "تطبيق",
    marks: 2,
    sourceReferenceId: "R-MOMENT-CONTEXT",
    lessonLabel: "عزم القوة",
    outcomeLabel: "يفسر أثر موضع تأثير القوة في عزم الدوران",
    styleTarget: "سياقي",
    visualTarget: "context_scene",
    scenarioTarget: "door_handle",
    stimulusTarget: "real_life_scene",
    skillTarget: "apply",
    diversityKey: "moment:door:context",
  };
  const request = {
    subject: "الفيزياء",
    topic: "عزم القوة",
    references: [{
      id: "R-MOMENT-CONTEXT",
      sourceId: "student-book",
      sourceTitle: "كتاب الطالب",
      sourceKind: "كتاب الطالب",
      pageFrom: 20,
      pageTo: 20,
      content: "يعتمد عزم القوة على مقدار القوة والمسافة العمودية عن محور الدوران.",
      lessonTopic: "عزم القوة",
      lessonScopeMode: "page-range",
      lessonPageFrom: 20,
      lessonPageTo: 20,
    }],
  };

  assert.equal(helpers.generationItemHasMomentConcept(item), true);
  const visual = helpers.buildServerOwnedVisualSpec(item, request);
  assert.equal(visual.type, "context_scene");
  assert.match(`${visual.purpose} ${visual.altText} ${visual.labels.join(" ")} ${visual.annotations.join(" ")}`, /محور الدوران|مفصل الباب/u);
  assert.match(`${visual.purpose} ${visual.altText} ${visual.labels.join(" ")} ${visual.annotations.join(" ")}`, /ذراع القوة|المسافة/u);
  assert.match(`${visual.purpose} ${visual.altText} ${visual.labels.join(" ")} ${visual.annotations.join(" ")}`, /موضع تأثير القوة|المقبض/u);

  const scientificItem = helpers.buildServerOwnedScientificItem(item, request, visual);
  assert.equal(scientificItem.kind, "generic");
  assert.doesNotThrow(() => helpers.validateAssessmentQuality(
    {
      stimulus: "يفتح طالب باب المختبر بالضغط على المقبض كما في المشهد المرفق.",
      text: "فسر كيف يؤثر موضع القوة في عزم دوران الباب.",
      options: [],
      answer: "يزداد العزم عندما يزداد ذراع القوة.",
      rationale: "المقبض أبعد عن المفصل من النقاط القريبة منه.",
      markScheme: ["ربط موضع القوة بذراع القوة.", "تفسير زيادة العزم بزيادة الذراع."],
      sourceEvidenceId: "",
      enrichmentEvidenceId: "",
      needsReview: false,
    },
    "door_handle",
    "real_life_scene",
    "apply",
    "modern:moment-context-contract",
    visual,
    scientificItem,
  ));
});
