import { assertWathiqPatchAtLeast } from "./version-assertions.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const domain = await readFile(new URL("../src/domain.ts", import.meta.url), "utf8");
const generator = await readFile(new URL("../src/question-generation.ts", import.meta.url), "utf8");
const storage = await readFile(new URL("../src/storage.ts", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const deployment = await readFile(new URL("../docs/DEPLOYMENT.md", import.meta.url), "utf8");
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

test("يحفظ المحرك التدريجي كل مفردة ويعيد المتعذرة وحدها بتوازٍ محدود", async () => {
  const orchestrator = await readFile(new URL("../src/assessment-generation-orchestrator.ts", import.meta.url), "utf8");
  assert.match(generator, /GENERATION_BATCH_SIZE\s*=\s*2/);
  assert.match(orchestrator, /concurrency \?\? 2/);
  assert.match(orchestrator, /retryItem/);
  assert.match(app, /دون لمس الأسئلة المكتملة/);
  assert.match(app, /persistDraftCheckpoint\(false\)/);
  assert.match(edge, /MAX_BATCH_ITEMS\s*=\s*2/);
});

test("تقوي قراءة JSON من Gemini وتبقي النشر من محرر Supabase", () => {
  assert.match(edge, /parseGeneratedJson/);
  assert.match(edge, /```\(\?:json\)\?/);
  assert.match(edge, /JSON غير صالح أو مبتور/);
  assert.match(edge, /responseJsonSchema/);
  assert.match(deployment, /محرر Supabase/);
  assert.match(deployment, /GEMINI_API_KEY/);
  assert.doesNotMatch(`${edge}\n${deployment}`, /OPENAI_API_KEY|api\.openai\.com/);
  assertWathiqPatchAtLeast(pkg.version, 32);
});
