import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url);
const text = (relativePath) => readFile(new URL(relativePath, root), "utf8");

async function missing(relativePath) {
  try { await access(new URL(relativePath, root)); return false; }
  catch { return true; }
}

test("النواة الحالية لا تحتوي منظومة رفع مصادر أو Google Drive أو OCR", async () => {
  const forbiddenPaths = [
    "src/google-drive.ts",
    "src/central-source-store.ts",
    "src/source-domain.ts",
    "src/source-registry.ts",
    "src/source-retrieval.ts",
    "src/pdf-indexer.ts",
    "src/ocr-indexer.ts",
    "src/lesson-catalog.ts",
    "supabase/functions/google-drive-oauth/index.ts",
    "supabase/functions/source-ocr/index.ts",
  ];
  for (const item of forbiddenPaths) assert.equal(await missing(item), true, item);
  const app = await text("src/app.ts");
  assert.doesNotMatch(app, /إدارة المحتوى|مصادر اختيارية|رفع PDF|OCR|Google Drive/iu);
  assert.match(app, /اسم الموضوع يكفي/);
});

test("مولد المفردة يعتمد سياق كامبريدج العالمي ومؤلفًا حرًا ثم مراجعًا مستقلاً", async () => {
  const worker = await text("supabase/functions/assessment-generation-worker/index.ts");
  assert.match(worker, /gemini-3\.6-flash/);
  assert.match(worker, /role: "assessment_author"/);
  assert.match(worker, /role: "independent_science_assessment_reviewer"/);
  assert.match(worker, /اختر أفضل سياق ومثير وبنية للسؤال بنفسك/);
  assert.match(worker, /الحرية هنا حرية في التأليف، وليست إذنًا بإنتاج سؤال سهل أو سطحي/);
  assert.match(worker, /يمكنك إعادة كتابة finalItem كاملة/);
  assert.match(worker, /التطبيق يعني توظيف المعرفة/);
  assert.match(worker, /الاستدلال يعني معالجة دليل أو علاقة/);
  assert.match(worker, /Cambridge Primary Science 0097/);
  assert.match(worker, /Cambridge Lower Secondary Science 0893/);
  assert.match(worker, /Cambridge IGCSE science/);
  assert.doesNotMatch(worker, /مصدر مرفوع|المصدر الاختياري|دليل المعلم|نواتج التعلم/u);
  assert.doesNotMatch(worker, /contentSharedTokens|contentSupport\s*</);
});

test("عقد التوليد لا يحمل قوالب تأليف أو أهدافًا اصطناعية أو variant بصريًا تاريخيًا", async () => {
  const progressive = await text("src/assessment-generation-progressive.ts");
  const contracts = await text("src/assessment-engine/contracts.ts");
  const visualTypes = await text("src/types.ts");
  const worker = await text("supabase/functions/assessment-generation-worker/index.ts");
  for (const forbidden of [
    "styleTarget", "visualTarget", "scenarioTarget", "stimulusTarget", "skillTarget", "diversityKey",
    "numericSeed", "scientificContractKey", "scientificRequirements", "outcomeId", "outcomeLabel",
  ]) {
    assert.doesNotMatch(progressive, new RegExp(forbidden));
    assert.doesNotMatch(contracts, new RegExp(`\\b${forbidden}\\b\\s*:`));
    assert.doesNotMatch(worker, new RegExp(`\\"${forbidden}\\"`));
  }
  assert.doesNotMatch(visualTypes, /QuestionVisualVariant|QuestionVisualRole/);
  assert.doesNotMatch(worker, /variant\s*:/);
  assert.doesNotMatch(worker, /needsReview\s*:/);
});

test("المرئيات العلمية الدقيقة ترسم من بيانات منظمة والمشهد السياقي وحده يستخدم نموذج الصور", async () => {
  const visual = await text("src/question-visual.ts");
  const edge = await text("supabase/functions/science-visual-generation/index.ts");
  const worker = await text("supabase/functions/assessment-generation-worker/index.ts");
  assert.match(visual, /return spec\.type === "context_scene"/);
  assert.match(visual, /renderForceDiagram/);
  assert.match(visual, /renderCircuitDiagram/);
  assert.match(visual, /renderRayDiagram/);
  assert.match(worker, /force_diagram/);
  assert.match(worker, /مخطط مرئي علمي متخصص/);
  assert.match(edge, /المخططات العلمية ذات البيانات والاتجاهات تُرسم حتميًا داخل واثق/);
  assert.match(edge, /gemini-3\.1-flash-image/);
  assert.match(edge, /wathiq-context-scene-v2/);
});

test("مسار الصور يحمل هوية كامبريدج ويعمل أيضًا في IGCSE بلا رقم مرحلة", async () => {
  const client = await text("src/visual-jobs.ts");
  const jobs = await text("supabase/functions/question-visual-jobs/index.ts");
  const visual = await text("supabase/functions/science-visual-generation/index.ts");
  for (const source of [client, jobs, visual]) {
    assert.match(source, /programmeId/);
    assert.match(source, /syllabusCode/);
    assert.match(source, /stageLabel/);
  }
  assert.doesNotMatch(client, /if \(draft\.grade === null\) return \[\]/);
});

test("محركات التوليد وشجرة الكتاب القديمة غير موجودة", async () => {
  for (const item of [
    "src/question-generation.ts",
    "src/assessment-generation-v2.ts",
    "src/positional-toc.ts",
    "src/toc-draft-builder.ts",
    "src/toc-layout-ocr.ts",
    "src/source-structure.ts",
    "src/book-content-tree.ts",
    "src/scientific-item.ts",
    "src/assessment-engine/source-grounding.ts",
    "src/assessment-engine/normalization.ts",
    "supabase/functions/generate-source-questions/index.ts",
  ]) assert.equal(await missing(item), true, item);
});

test("مخطط Supabase الحالي واحد ولا يحتوي جداول المصادر القديمة", async () => {
  const schema = await text("supabase/schema-current.sql");
  assert.doesNotMatch(schema, /google_drive_connections|source_upload_sessions|source_structure_nodes|source_registry|source_chunks|source_ocr_pages|scene_2d_overlay/);
  const sqlFiles = (await readdir(new URL("supabase/", root))).filter((name) => name.endsWith(".sql"));
  assert.deepEqual(sqlFiles, ["schema-current.sql"]);
});

test("الواجهة تبدأ من كامبريدج وتغطي Primary وLower Secondary وIGCSE بالعربية", async () => {
  const app = await text("src/app.ts");
  const curriculum = await text("src/cambridge-curriculum.ts");
  assert.match(app, /اسم الموضوع يكفي/);
  assert.match(app, /المرحلة الابتدائية/);
  assert.match(app, /المرحلة الإعدادية/);
  assert.match(app, /الشهادة الدولية العامة للتعليم الثانوي/);
  assert.match(curriculum, /stageFrom: 1/);
  assert.match(curriculum, /stageTo: 6/);
  assert.match(curriculum, /stageFrom: 7/);
  assert.match(curriculum, /stageTo: 9/);
  assert.doesNotMatch(app, /سلطنة عُمان|وزارة التعليم|إدارة المحتوى/);
});

test("كل ملفات TypeScript داخل src مرتبطة فعليًا بجذر التطبيق", async () => {
  const srcDir = new URL("src/", root);
  const files = [];
  async function walk(dirUrl, prefix = "") {
    for (const entry of await readdir(dirUrl, { withFileTypes: true })) {
      const rel = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) await walk(new URL(`${entry.name}/`, dirUrl), rel);
      else if (entry.name.endsWith(".ts")) files.push(rel);
    }
  }
  await walk(srcDir);
  const imports = new Map();
  for (const file of files) {
    const content = await text(`src/${file}`);
    const deps = [...content.matchAll(/from\s+["'](\.\.?\/[^"']+)["']/g)].map((match) => match[1]);
    imports.set(file, deps);
  }
  const normalize = (from, spec) => {
    const base = path.posix.dirname(from);
    let resolved = path.posix.normalize(path.posix.join(base, spec));
    if (resolved.endsWith(".js")) resolved = `${resolved.slice(0, -3)}.ts`;
    if (!resolved.endsWith(".ts")) resolved += ".ts";
    return resolved;
  };
  const seen = new Set();
  const queue = ["app.ts"];
  while (queue.length) {
    const file = queue.shift();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    for (const spec of imports.get(file) ?? []) {
      const dep = normalize(file, spec);
      if (imports.has(dep) && !seen.has(dep)) queue.push(dep);
    }
  }
  const unreachable = files.filter((file) => file !== "app.ts" && !seen.has(file));
  assert.deepEqual(unreachable, []);
});
