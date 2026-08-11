import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateScienceItem } from "../dist/assets/science-validation.js";

const root = new URL("../", import.meta.url);
const text = (relativePath) => readFile(new URL(relativePath, root), "utf8");

function extractScienceValidator(worker) {
  const start = worker.indexOf("function validateScienceAdapters(");
  const end = worker.indexOf("function selectEvidenceAnchor(", start);
  assert.ok(start >= 0 && end > start, "تعذر العثور على محقق العلوم داخل العامل");
  const source = worker.slice(start, end)
    .replace("function validateScienceAdapters(content: ModelContent, contract: ItemContract): string[]", "function validateScienceAdapters(content, contract)")
    .replace("const issues: string[] = [];", "const issues = [];");
  return new Function(`${source}; return validateScienceAdapters;`)();
}

function baseContent(overrides = {}) {
  return {
    stimulus: "",
    text: "سؤال في الكهرباء الساكنة",
    options: [],
    answer: "إجابة صحيحة",
    rationale: "تفسير صحيح",
    markScheme: ["نقطة صحيحة"],
    visual: { mode: "none" },
    ...overrides,
  };
}

const physicsContract = {
  subject: "الفيزياء",
  topic: "الكهرباء الساكنة",
  lessonLabel: "الاحتكاك والشحن الكهربائي",
};

test("محقق الفيزياء يرفض تأريض أنبوب بلاستيكي عازل بوصفه مسار التفريغ", async () => {
  const validate = extractScienceValidator(await text("supabase/functions/assessment-generation-worker/index.ts"));
  const issues = validate(baseContent({
    stimulus: "يتدفق الوقود عبر أنبوب بلاستيكي عازل إلى خزان.",
    answer: "يتم توصيل الأنبوب والخزان بالأرض بسلك موصل.",
    markScheme: ["تأريض الأنبوب والخزان لتفريغ الشحنة إلى الأرض."],
  }), physicsContract);
  assert.equal(issues.length > 0, true);
  assert.match(issues.join(" "), /بلاستيكي عازل|مسارًا فعالًا لتفريغ الشحنة/);
});

test("محقق الفيزياء يرفض انتقال البروتونات في الشحن بالاحتكاك", async () => {
  const validate = extractScienceValidator(await text("supabase/functions/assessment-generation-worker/index.ts"));
  const issues = validate(baseContent({
    answer: "انتقلت البروتونات من القضيب إلى القماش.",
    markScheme: ["انتقال البروتونات بين الجسمين."],
  }), physicsContract);
  assert.equal(issues.length > 0, true);
  assert.match(issues.join(" "), /الإلكترونات لا انتقال البروتونات/);
});


test("محقق الواجهة يمنع اعتماد المسودة القديمة التي تحمل نفس تناقض التأريض", () => {
  const issues = validateScienceItem({
    subject: "الفيزياء",
    topic: "الكهرباء الساكنة",
    lessonLabel: "الاحتكاك والشحن الكهربائي",
    proposal: {
      stimulus: "يتدفق الوقود عبر أنبوب بلاستيكي عازل إلى خزان.",
      text: "فسر الخطر واقترح إجراء وقائيًا.",
      answer: "يتم توصيل الأنبوب والخزان بالأرض بسلك موصل.",
      rationale: "تفريغ الشحنات المتراكمة.",
      markScheme: ["تأريض الأنبوب والخزان لتفريغ الشحنة إلى الأرض."],
    },
  });
  assert.equal(issues.some((issue) => issue.code === "PHYSICS_GROUNDING_INSULATOR"), true);
});

test("المراجع يقرر صراحة ضرورة المثير والمرئي بدل فرضهما", async () => {
  const worker = await text("supabase/functions/assessment-generation-worker/index.ts");
  assert.match(worker, /stimulusDisposition/);
  assert.match(worker, /visualRequirement/);
  assert.match(worker, /enum: \["none", "helpful", "required"\]/);
  assert.match(worker, /required فقط إذا كان الطالب لا يستطيع الإجابة بعدل من النص وحده/);
  assert.match(worker, /reviewed\.visualRequirement === "required" && content\.visual\.mode === "none"/);
  assert.match(worker, /المثير الموجّه للطالب يبقى فقط إذا كان يحمل بيانات أو موقفًا لازمًا/);
});

test("ورقة الطالب لا تعرض رسائل فشل الأصول البصرية ولا العبارة النظامية الداخلية", async () => {
  const app = await text("src/app.ts");
  const visual = await text("src/question-visual.ts");
  assert.match(app, /renderQuestionVisualForPaper/);
  assert.match(app, /function studentPaperStimulus/);
  assert.match(app, /ملاحظات تمنع الاعتماد/);
  assert.match(app, /validateScienceItem/);
  assert.doesNotMatch(app, /اختبار علوم مُنشأ ومراجع داخل واثق/);
  assert.match(visual, /if \(isAiIllustrationEligible\(spec\) && !isValidated2DIllustration\(spec\)\) return "";/);
});

test("واجهة المراجعة تفصل نموذج التصحيح عن التفسير العلمي وملاحظات المراجع", async () => {
  const app = await text("src/app.ts");
  assert.match(app, /<summary>الإجابة ونموذج التصحيح<\/summary>/);
  assert.match(app, /<summary>التفسير العلمي وملاحظات المراجع<\/summary>/);
  assert.match(app, /<small>\$\{escapeHtml\(item\.lessonLabel\)\}<\/small>/);
});
