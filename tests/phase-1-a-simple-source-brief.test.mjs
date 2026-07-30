import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const domain = await readFile(new URL("../src/domain.ts", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("مسار المحتوى يستخدم قائمة دروس بسيطة بدل هرم الوحدات التجريبي", () => {
  assert.match(app, /الدروس الداخلة في الاختبار/);
  assert.match(app, /data-lesson-topic-index/);
  assert.match(app, /data-action="add-lesson"/);
  assert.match(app, /data-action="remove-lesson"/);
  assert.doesNotMatch(app, /id="topic-input"/);
  assert.doesNotMatch(app, /id="unit-select"/);
  assert.doesNotMatch(app, /data-group="lesson"/);
  assert.doesNotMatch(app, /data-group="outcome"/);
});

test("يبحث عن صفحات كل درس قبل المتابعة", () => {
  assert.match(app, /prepareSourceContext/);
  assert.match(app, /listSourceChunks/);
  assert.match(app, /rankSourceChunks\(lesson/);
  assert.match(app, /لم يجد واثق صفحات واضحة للدروس/);
  assert.match(app, /lessonTopic:\s*lesson/);
});

test("لا يدعي اعتمادًا علميًا نهائيًا ويحفظ مرجع كل مفردة", () => {
  assert.doesNotMatch(app, /اعتماد النموذج أ/);
  assert.match(app, /تحتاج مراجعة المعلم قبل الاستخدام/);
  assert.match(domain, /sourceReferenceId/);
  assert.match(domain, /MIN_LESSON_TOPICS\s*=\s*2/);
  assert.match(domain, /MAX_LESSON_TOPICS\s*=\s*5/);
  assert.match(pkg.version, /^0\.0\.(?:32|33|34|35|36|37|38)$/);
});
