import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const tree = await readFile(new URL("../src/book-content-tree.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("يعرض مسارًا واحدًا هرميًا: الكتاب ثم الوحدات ثم الدروس", () => {
  assert.match(app, /شجرة محتوى الكتاب/);
  assert.match(app, /lesson-source-tree/);
  assert.match(app, /lesson-unit-tree/);
  assert.match(app, /الكتاب ← الوحدات ← الدروس/);
  assert.match(styles, /\.lesson-book-tree/);
  assert.match(styles, /\.lesson-source-tree/);
  assert.match(styles, /\.lesson-unit-tree/);
  assert.doesNotMatch(app, /data-action="add-lesson"|data-lesson-topic-index|id="topic-input"/);
});

test("يستخدم شجرة معتمدة للكتاب الحالي ولا يحتاج إعادة فهرسة أو Gemini", () => {
  assert.match(app, /buildCuratedBookStructure/);
  assert.match(tree, /WTH-OM-G10-PHY-STU-S1-/);
  assert.match(tree, /الوحدة التاسعة: النشاط الإشعاعي/);
  assert.match(tree, /9-3.*استخدام النظائر المشعة/);
  assert.doesNotMatch(tree, /fetch\(|GEMINI_API_KEY|OCR/);
});

test("يحصر استرجاع كل درس في مصدره ونطاق صفحاته", () => {
  assert.match(app, /candidate\.source\.id === catalogLesson\.sourceId/);
  assert.match(app, /candidate\.chunk\.pageFrom <= pageEnd/);
  assert.match(app, /candidate\.chunk\.pageTo >= pageStart/);
  assert.match(app, /rankSourceChunks\(query, exactPageScoped, 2\)/);
});

test("يحافظ على وظيفة التوليد دون تعديل ويثبت الإصدار الجديد", () => {
  assert.match(edge, /generateContent/);
  assert.match(pkg.version, /^0\.0\.(?:39|40|41|42|43|44|45|46|47|48|49|50|51|52|53|54|55|56)$/);
});
