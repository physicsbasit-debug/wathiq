import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

async function missing(path) {
  try { await access(new URL(`../${path}`, import.meta.url)); return false; }
  catch { return true; }
}

test("مسار المصادر المباشر لا يعتمد على Google Drive أو OAuth", async () => {
  const app = await text("src/app.ts");
  const config = await text("src/runtime-config.ts");
  const supabase = await text("supabase/config.toml");
  assert.equal(await missing("src/google-drive.ts"), true);
  assert.equal(await missing("supabase/functions/google-drive-oauth/index.ts"), true);
  assert.doesNotMatch(config, /googleOAuth|Google Drive/iu);
  assert.doesNotMatch(supabase, /google-drive-oauth/);
  assert.match(supabase, /\[functions\.source-ocr\]/);
  assert.match(app, /extractPdfText\(file,/);
  assert.match(app, /extractPdfWithArabicOcr\(/);
  assert.match(app, /ocrSourcePage/);
  assert.doesNotMatch(app, /GoogleDriveService|connectGoogleDrive|google-drive-oauth/);
});

test("مولد المفردة مؤلف حر ثم مراجع علمي مستقل ولا يستخدم بوابة تطابق كلمات", async () => {
  const worker = await text("supabase/functions/assessment-generation-worker/index.ts");
  assert.match(worker, /gemini-3\.6-flash/);
  assert.match(worker, /role: "assessment_author"/);
  assert.match(worker, /role: "independent_science_assessment_reviewer"/);
  assert.match(worker, /اختر أفضل سياق ومثير وبنية للسؤال بنفسك/);
  assert.match(worker, /يمكنك إعادة كتابة finalItem كاملة/);
  assert.match(worker, /thinkingConfig: \{ thinkingLevel \}/);
  assert.match(worker, /sourceContext/);
  assert.match(worker, /دليل المعلم/);
  assert.match(worker, /نواتج التعلم/);
  assert.doesNotMatch(worker, /contentSharedTokens|contentSupport\s*<|السؤال لا يرتبط بدليل كاف/);
});

test("عقد التوليد نفسه لا يحمل قوالب تأليف أو أهدافًا اصطناعية مسبقة", async () => {
  const progressive = await text("src/assessment-generation-progressive.ts");
  const contracts = await text("src/assessment-engine/contracts.ts");
  const worker = await text("supabase/functions/assessment-generation-worker/index.ts");
  for (const forbidden of ["styleTarget", "visualTarget", "scenarioTarget", "stimulusTarget", "skillTarget", "diversityKey", "numericSeed", "scientificContractKey", "scientificRequirements", "outcomeId", "outcomeLabel"]) {
    assert.doesNotMatch(progressive, new RegExp(forbidden));
    assert.doesNotMatch(contracts, new RegExp(`\\b${forbidden}\\b\\s*:`));
    assert.doesNotMatch(worker, new RegExp(`\\"${forbidden}\\"`));
  }
  assert.doesNotMatch(contracts, /needsReview\s*:/);
  assert.doesNotMatch(worker, /needsReview\s*:/);
  assert.doesNotMatch(worker, /variant:\s*"laboratory_setup"/u, "المؤلف الحر لا يُجبر كل رسم 2D على مشهد مختبر");
  assert.match(worker, /examContext/);
});

test("وظيفة science-visual-generation مرئية فقط ولا تولد أسئلة", async () => {
  const edge = await text("supabase/functions/science-visual-generation/index.ts");
  assert.match(edge, /مخصصة لإنشاء الأصول العلمية ثنائية الأبعاد فقط/);
  assert.match(edge, /gemini-3\.1-flash-image/);
  assert.match(edge, /gemini-3\.6-flash/);
  assert.match(edge, /reviewImage/);
  assert.match(edge, /scientificRelationshipCorrect/);
  assert.match(edge, /noScientificContradiction/);
  assert.match(edge, /noExtraScientificObjects/);
  assert.match(edge, /لا يستخدم واثق أي رسم خطي بديل/);
  assert.doesNotMatch(edge, /النسخة الدلالية|نوع المرئي:/u, "لا ينبغي أن تحوّل حقول النوع/variant القديمة إلى قيد على مؤلف الصورة 2D");
  assert.doesNotMatch(edge, /status:\s*"fallback"/u, "فشل 2D يجب أن يبقى فشلًا صريحًا بلا مسار fallback");
  assert.doesNotMatch(edge, /legacy_items|whole_exam_v2|officialPlanItems|trustedEnrichmentEnabled|generateAndValidate/);
});

test("محركات التوليد والتخزين القديمة غير موجودة في شجرة التشغيل", async () => {
  for (const path of [
    "src/question-generation.ts",
    "src/assessment-generation-v2.ts",
    "src/positional-toc.ts",
    "src/toc-draft-builder.ts",
    "src/toc-layout-ocr.ts",
    "src/source-structure.ts",
    "src/book-content-tree.ts",
    "src/assessment-engine/source-grounding.ts",
    "src/assessment-engine/normalization.ts",
    "supabase/functions/generate-source-questions/index.ts",
  ]) assert.equal(await missing(path), true, path);
});


test("الإعداد الجديد يستخدم مخطط Supabase حاليًا واحدًا ولا يحمل جداول Drive أو شجرة كتاب", async () => {
  const schema = await text("supabase/schema-current.sql");
  assert.doesNotMatch(schema, /google_drive_connections|source_upload_sessions|source_structure_nodes|scene_2d_overlay/);
  assert.match(schema, /create table if not exists public\.source_registry/);
  assert.equal(await missing("supabase/phase_0_e_source_registry.sql"), true);
});

test("اختيار الدرس إدخال حر واقتراحات العناوين مساعدة فقط", async () => {
  const app = await text("src/app.ts");
  const catalog = await text("src/lesson-catalog.ts");
  assert.match(app, /id="lesson-topics-input"/);
  assert.match(catalog, /Suggestions only/);
  assert.doesNotMatch(app, /source_structure_nodes|buildBookContentTree|listSourceStructure|MOCK_LIBRARY/);
  const data = await text("src/data.ts");
  assert.doesNotMatch(data, /وحدة تجريبية|demoOutcomes|MOCK_LIBRARY/);
});

test("الواجهة والإخراج Cambridge-first ولا يحملان هوية تقويم محلية", async () => {
  const app = await text("src/app.ts");
  const curriculum = await text("src/cambridge-curriculum.ts");
  assert.match(app, /اسم الموضوع يكفي/);
  assert.match(app, /Cambridge Primary · Lower Secondary · IGCSE/);
  assert.match(curriculum, /stageFrom: 1/);
  assert.match(curriculum, /stageTo: 6/);
  assert.match(curriculum, /stageFrom: 7/);
  assert.match(curriculum, /stageTo: 9/);
  assert.doesNotMatch(app, /سلطنة عُمان|وزارة التعليم|شعار<br\/>الخنجر/);
});

test("المصدر المرفوع اختياري ومعلومات الفصل والإصدار ليست بوابة إدخال", async () => {
  const domain = await text("src/domain.ts");
  const sourceDomain = await text("src/source-domain.ts");
  assert.doesNotMatch(domain, /غير مرتبط بمصدر مفهرس|sourceReferences\.length\s*===\s*0/);
  assert.doesNotMatch(sourceDomain, /field: "semester"/);
  assert.doesNotMatch(sourceDomain, /field: "version"/);
  assert.match(sourceDomain, /مصدر مرفوع/);
});
