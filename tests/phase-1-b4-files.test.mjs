import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const domain = await readFile(new URL("../src/domain.ts", import.meta.url), "utf8");
const policy = await readFile(new URL("../src/assessment-policy.ts", import.meta.url), "utf8");
const storage = await readFile(new URL("../src/storage.ts", import.meta.url), "utf8");
const generator = await readFile(new URL("../src/question-generation.ts", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("Phase 1-B4 تعرض عنوان الاختبار في قائمة منسدلة بثلاثة خيارات", () => {
  assert.match(policy, /الاختبار القصير الأول/);
  assert.match(policy, /الاختبار القصير الثاني/);
  assert.match(policy, /الاختبار النهائي/);
  assert.match(app, /id="exam-title-select"/);
  assert.doesNotMatch(app, /id="title-input"/);
  assert.match(app, /setExamTitle\(state\.draft, title\)/);
});

test("تلتقط تاريخ الاختبار فورًا وتعيد قراءته قبل التحقق", () => {
  assert.match(domain, /examDate:\s*toDateInputValue\(now\)/);
  assert.match(app, /addEventListener\("change", update\)/);
  assert.match(app, /addEventListener\("blur", update\)/);
  assert.match(app, /syncSetupFieldsFromDom\(\)/);
  assert.match(storage, /toDateInputValue\(\)/);
});

test("يدعم القالب النهائي الرسمي في الواجهة والخادم", () => {
  assert.match(policy, /getOfficialFinalExamSpec/);
  assert.match(policy, /totalMarks:\s*60/);
  assert.match(policy, /counts:\s*\{ mcq: 10, short: 22, long: 2 \}/);
  assert.match(generator, /AssessmentType/);
  assert.match(edge, /امتحان نهاية الفصل الدراسي/);
  assert.match(edge, /MAX_OFFICIAL_ITEMS\s*=\s*40/);
  assert.match(edge, /validateOfficialAssessmentPlan/);
  assert.match(pkg.version, /^0\.0\.(?:32|33|34|35|36|37|38|39|40|41|42|43|44|45|46|47|48|49|50|51|52|53|54|55|56|57|58|59|60|61|62|63)$/);
});
