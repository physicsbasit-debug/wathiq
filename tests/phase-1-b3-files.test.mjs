import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const domain = await readFile(new URL("../src/domain.ts", import.meta.url), "utf8");
const generator = await readFile(new URL("../src/question-generation.ts", import.meta.url), "utf8");
const storage = await readFile(new URL("../src/storage.ts", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const deployment = await readFile(new URL("../docs/PHASE_1_B_DEPLOYMENT.md", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("Phase 1-B3 تقبل من درسين إلى خمسة وتربط كل درس بمقاطعه", () => {
  assert.match(domain, /MIN_LESSON_TOPICS\s*=\s*2/);
  assert.match(domain, /MAX_LESSON_TOPICS\s*=\s*5/);
  assert.match(app, /افتح اسم الكتاب، ثم الوحدة، وحدد من درسين إلى خمسة دروس/);
  assert.match(app, /rankSourceChunks\(query, exactPageScoped, 2\)/);
  assert.match(app, /lessonTopic:\s*lesson/);
  assert.match(styles, /\.lesson-book-tree/);
  assert.match(storage, /lessonTopics/);
});

test("تولد الأسئلة على دفعات صغيرة وتحفظ المكتمل عند الفشل", () => {
  assert.match(generator, /GENERATION_BATCH_SIZE\s*=\s*2/);
  assert.match(generator, /splitQuestionGenerationBatches/);
  assert.match(app, /تم الاحتفاظ بـ/);
  assert.match(app, /اضغط التالي لإكمال الباقي فقط/);
  assert.match(edge, /MAX_BATCH_ITEMS\s*=\s*2/);
  assert.match(edge, /officialPlanItems/);
});

test("تقوي قراءة JSON من Gemini وتبقي النشر من محرر Supabase", () => {
  assert.match(edge, /parseGeneratedJson/);
  assert.match(edge, /```\(\?:json\)\?/);
  assert.match(edge, /JSON غير صالح أو مبتور/);
  assert.match(edge, /responseJsonSchema/);
  assert.match(deployment, /محرر Supabase/);
  assert.match(deployment, /GEMINI_API_KEY/);
  assert.doesNotMatch(`${edge}\n${deployment}`, /OPENAI_API_KEY|api\.openai\.com/);
  assert.match(pkg.version, /^0\.0\.(?:32|33|34|35|36|37|38|39|40|41|42|43|44|45|46|47|48|49|50|51|52|53|54|55|56|57|58|59|60)$/);
});
