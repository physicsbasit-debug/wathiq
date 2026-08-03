import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const policy = await readFile(new URL("../src/assessment-policy.ts", import.meta.url), "utf8");
const generator = await readFile(new URL("../src/question-generation.ts", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("يثبت مرجع عُمان حاكمًا ويضيف مبادئ بناء أسلوبي دولي بلا نسخ", () => {
  assert.match(policy, /INTERNATIONAL_SCIENCE_QUESTION_STYLE_PRINCIPLES/);
  assert.match(policy, /مرجع التقويم العُماني هو الحاكم/);
  assert.match(policy, /لا في نسخ الأسئلة/);
  assert.match(app, /مواءمة أسلوبية مع الاختبارات الدولية/);
});

test("يفرض على Gemini أنماط السياق والبيانات والاستقصاء ونقطة لكل درجة", () => {
  assert.match(generator, /QuestionDesignPattern/);
  assert.match(generator, /source-grounded-policy-ai-(?:9-visual-svg|10-strict-lesson-scope|11-visual-enforced|12-advanced-visuals|13-trusted-enrichment|14-contextual-stimulus-alignment|15-controlled-hybrid-visuals|16-assessment-quality-context-diversity)/);
  assert.match(edge, /styleTarget=بيانات/);
  assert.match(edge, /styleTarget=استقصائي/);
  assert.match(edge, /markScheme كمصفوفة نصية طولها يساوي marks تمامًا/);
  assert.match(edge, /mark_scheme_repair_started/);
  assert.match(edge, /أخطاء مفاهيمية أو عددية شائعة/);
});

test("ينظف ورقة الطالب من مراجع المصدر ويضعها في نموذج المعلم", () => {
  assert.doesNotMatch(app, /class="question-source-note"/);
  assert.match(app, /نموذج الإجابة وأدلة المصدر/);
  assert.match(app, /buildPaperLayout/);
  assert.match(app, /structured-question/);
  assert.match(app, /paper-stimulus/);
  assert.match(styles, /structured-question-header/);
});

test("يرفع إصدار واثق ويحافظ على التوليد الموثق", () => {
  assert.match(pkg.version, /^0\.0\.(?:34|35|36|37|38|39|40|41|42|43|44|45|46|47|48|49|50|51|52|53|54|55|56|57|58)$/);
  assert.match(pkg.description, /المرجع العُماني/);
  assert.match(pkg.description, /كامبريدج/);
  assert.match(edge, /sourceSupport: evidence\.text/);
});
