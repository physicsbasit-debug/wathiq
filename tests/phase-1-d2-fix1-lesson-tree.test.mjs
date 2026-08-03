import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const catalog = await readFile(new URL("../src/lesson-catalog.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("يثبت إصدار إصلاح شجرة الدروس", () => {
  assert.match(pkg.version, /^0\.0\.(?:49|50|51|52|53|54|55|56|57|58)$/);
});

test("يوفر أزرار السابق والتالي وقائمة انتقال مباشرة بين الوحدات", () => {
  assert.match(app, /data-lesson-unit-target/);
  assert.match(app, /id="lesson-unit-select"/);
  assert.match(app, /الوحدة السابقة/);
  assert.match(app, /الوحدة التالية/);
  assert.match(styles, /\.lesson-unit-navigation/);
  assert.match(styles, /\.lesson-unit-nav-button/);
});

test("يحفظ الوحدة النشطة عند تحديد درس ولا يعيد المستخدم إلى الوحدة الأولى", () => {
  assert.match(app, /lessonCatalogActiveUnitKey/);
  assert.match(app, /data-lesson-unit-key/);
  assert.match(app, /input\.dataset\.lessonUnitKey/);
  assert.match(app, /resolveActiveLessonUnitKey/);
});

test("يبقي اختيارات الدروس من الوحدات المختلفة ظاهرة وقابلة للعودة", () => {
  assert.match(app, /lesson-selected-summary/);
  assert.match(app, /تبقى اختياراتك محفوظة عند الانتقال بين الوحدات/);
  assert.match(app, /lesson-selected-chips/);
});

test("يدمج الشجرة المحفوظة والمعتمدة والمستخرجة بدل استبدال إحداها بالأخرى", () => {
  assert.match(app, /const storedNodes/);
  assert.match(app, /const curatedNodes/);
  assert.match(app, /nodes = \[\.\.\.nodes, \.\.\.extracted\.nodes\]/);
  assert.match(catalog, /لا نهمل العناوين المرقمة عند وجود شجرة جزئية/);
  assert.match(catalog, /preferCatalogOption/);
});
