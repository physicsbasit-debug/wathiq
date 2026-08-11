import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildEvidenceSegments,
  selectEvidenceAnchor,
  validateAssessmentContentAgainstContract,
} from "../dist/assets/assessment-engine/index.js";
import {
  emptyQuestionVisualSpec,
  parseQuestionVisualSpec,
  renderQuestionVisualSvg,
} from "../dist/assets/question-visual.js";

const text = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("الكهرباء الساكنة لا تعود للرسم الخطي حتى لو صنفت المهارة calculate", () => {
  const visual = parseQuestionVisualSpec({
    ...emptyQuestionVisualSpec(),
    type: "electrostatic_diagram",
    variant: "attraction_repulsion",
    role: "calculate",
    title: "الاحتكاك والشحن الكهربائي",
    altText: "جسمان يحمل كل منهما شحنة موجبة",
    labels: ["الجسم الأول", "الجسم الثاني", "تنافر"],
    values: [0],
    annotations: ["repulsion", "positive", "positive"],
  }, "electrostatic_diagram");
  const html = renderQuestionVisualSvg(visual);
  assert.match(html, /data-visual-mode="2d-required"/);
  assert.doesNotMatch(html, /qv-charged-object|qv-force-arrow|question-visual-2d-vector/);
});



test("نمط انتقال الشحنة لا يعرض line-art حتى لو صنفت المهارة calculate", () => {
  const visual = parseQuestionVisualSpec({
    ...emptyQuestionVisualSpec(),
    type: "electrostatic_diagram",
    variant: "charge_transfer",
    role: "calculate",
    title: "شحن جسم بالدلك",
    altText: "جسمان يحدث بينهما انتقال للشحنة",
    labels: ["الجسم الأول", "الجسم الثاني"],
    annotations: ["انتقال الإلكترونات"],
  }, "electrostatic_diagram");
  const html = renderQuestionVisualSvg(visual);
  assert.match(html, /data-visual-mode="2d-required"/);
  assert.doesNotMatch(html, /qv-rod|qv-paper-piece|qv-electron-arrow/);
});

test("الربط بالمصدر لا يرفض سؤالًا صحيحًا لمجرد اختلاف الصياغة العربية عن عنوان الدرس", async () => {
  const source = [
    "المواد الموصلة تسمح بمرور التيار الكهربائي خلالها، ومن أمثلتها النحاس والمعادن.",
    "أما المواد العازلة مثل البلاستيك والمطاط فتقاوم مرور التيار وتستخدم للحماية من الصدمة الكهربائية.",
  ].join("\n\n");
  const segments = await buildEvidenceSegments(source);
  const contract = {
    lessonLabel: "الموصلات الكهربائية والعوازل",
    outcomeLabel: "يميز بين المواد الموصلة والمواد العازلة",
    topic: "الكهرباء",
    marks: 1,
    questionType: "اختيار من متعدد",
  };
  const content = {
    stimulus: "يستخدم سلك نحاسي مغطى بالبلاستيك في دائرة كهربائية.",
    text: "أي جزء يسمح بمرور التيار وأي جزء يقلل خطر الصدمة؟",
    options: ["النحاس يمرر التيار والبلاستيك يعزل", "البلاستيك يمرر التيار والنحاس يعزل", "كلاهما يعزل", "كلاهما يمرر التيار"],
    answer: "النحاس يمرر التيار والبلاستيك يعزل",
    rationale: "النحاس مادة موصلة بينما البلاستيك مادة عازلة.",
    markScheme: ["يحدد النحاس موصلًا والبلاستيك عازلًا."],
    needsReview: false,
  };
  const scientific = { expectedAnswerTokens: [] };
  assert.doesNotThrow(() => validateAssessmentContentAgainstContract(content, contract, scientific));
  const evidence = selectEvidenceAnchor(segments, contract, content);
  assert.ok(evidence.score >= 0.035);
});



test("Evidence Anchor يرفض سؤالًا غير متعلق بالمصدر حتى لو كان عقد الدرس صحيحًا", async () => {
  const source = [
    "المواد الموصلة تسمح بمرور التيار الكهربائي خلالها، ومن أمثلتها النحاس والمعادن.",
    "المواد العازلة مثل البلاستيك والمطاط تقاوم مرور التيار وتستخدم للحماية من الصدمة الكهربائية.",
  ].join("\n\n");
  const segments = await buildEvidenceSegments(source);
  const contract = {
    lessonLabel: "الموصلات الكهربائية والعوازل",
    outcomeLabel: "يميز بين المواد الموصلة والمواد العازلة",
    topic: "الكهرباء",
    marks: 1,
    questionType: "اختيار من متعدد",
  };
  const unrelated = {
    stimulus: "نبتة خضراء موضوعة قرب نافذة.",
    text: "ما العضية المسؤولة عن البناء الضوئي؟",
    options: ["البلاستيدة الخضراء", "النواة", "الفجوة", "الجدار الخلوي"],
    answer: "البلاستيدة الخضراء",
    rationale: "تحتوي البلاستيدات الخضراء على الكلوروفيل.",
    markScheme: ["يحدد البلاستيدة الخضراء."],
    needsReview: false,
  };
  assert.throws(() => selectEvidenceAnchor(segments, contract, unrelated), /لا يرتبط بدليل كاف/);
});

test("التوليد التدريجي يطلق مهام 2D عند اكتمال كل مفردة ولا ينتظر اكتمال الاختبار كله", async () => {
  const app = await text("src/app.ts");
  const hookStart = app.indexOf("function progressiveGenerationHooks");
  const hookEnd = app.indexOf("async function buildCurrentProgressivePayload", hookStart);
  const hook = app.slice(hookStart, hookEnd);
  assert.match(hook, /applyProgressiveGenerationSnapshot\(snapshot, payload\);\s*scheduleRequiredVisualJobSync\(\);/);
  assert.match(app, /VISUAL_JOB_AUTO_ENQUEUE_DELAY_MS = 250/);
  assert.match(app, /requiredVisualJobItems\(state\.draft, visualJobSubject\(\)\)/);
  assert.match(app, /if \(state\.visualJobSyncBusy\) \{[\s\S]*?scheduleRequiredVisualJobSync\(\);[\s\S]*?return;/);
  const signatureStart = app.indexOf("function currentAutoVisualEnqueueSignature");
  const signatureEnd = app.indexOf("function scheduleRequiredVisualJobSync", signatureStart);
  const signature = app.slice(signatureStart, signatureEnd);
  assert.doesNotMatch(signature, /previousAssetPath/);
});

test("عامل D4 يثبت الارتباط عبر Evidence Anchor بدل المطابقة الحرفية لعنوان الدرس", async () => {
  const worker = await text("supabase/functions/assessment-generation-worker/index.ts");
  assert.match(worker, /const evidence = selectEvidenceAnchor\(evidenceSegments, contract, content\);\s*validateContent\(content, contract, scientific\);/);
  assert.match(worker, /contentSupport \* 0\.75 \+ contractSupport \* 0\.25/);
  assert.match(worker, /contentSharedTokens < 2/);
  assert.match(worker, /contentSupport < 0\.06/);
  assert.doesNotMatch(worker, /السؤال لا يرتبط بالدرس أو هدف التعلم في عقد المفردة/);
});
