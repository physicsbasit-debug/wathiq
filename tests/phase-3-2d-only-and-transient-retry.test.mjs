import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  emptyQuestionVisualSpec,
  parseQuestionVisualSpec,
  renderQuestionVisualSvg,
} from "../dist/assets/question-visual.js";

const text = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 3 لا يعرض الرسم الخطي الاحتياطي عندما يكون أصل 2D إلزاميًا", () => {
  const visual = parseQuestionVisualSpec({
    ...emptyQuestionVisualSpec(),
    type: "electrostatic_diagram",
    variant: "attraction_repulsion",
    role: "compare",
    title: "تفاعل جسمين مشحونين",
    altText: "جسمان مشحونان للمقارنة بين التجاذب والتنافر",
    labels: ["الجسم الأول", "الجسم الثاني"],
    annotations: ["تنافر", "positive", "positive"],
    values: [0],
  }, "electrostatic_diagram");
  const html = renderQuestionVisualSvg(visual);
  assert.match(html, /data-visual-mode="2d-required"/);
  assert.match(html, /الأصل العلمي 2D غير جاهز بعد/);
  assert.doesNotMatch(html, /qv-charged-object|qv-rod|question-visual-deterministic-fallback/);
});

test("D4 يعيد 429 و503 داخليًا بانتظار متدرج ولا يعرض رسالة المزود الإنجليزية للمستخدم", async () => {
  const worker = await text("supabase/functions/assessment-generation-worker/index.ts");
  assert.match(worker, /MODEL_TRANSIENT_RETRY_DELAYS_MS = \[2_000, 6_000\]/);
  assert.match(worker, /MODEL_TRANSIENT_HTTP_STATUSES = new Set\(\[408, 429, 502, 503, 504\]\)/);
  assert.match(worker, /await delay\(retryDelay \+ Math\.floor\(Math\.random\(\) \* 700\)\)/);
  assert.match(worker, /خدمة توليد الأسئلة مشغولة مؤقتًا بسبب ارتفاع الطلب/);
  assert.doesNotMatch(worker, /throw workerError\("MODEL_RATE_LIMITED", provider/);
});

test("فحص أصل 2D يشترط العلاقة والمكان وعدم التناقض والعناصر الزائدة", async () => {
  const edge = await text("supabase/functions/generate-source-questions/index.ts");
  assert.match(edge, /assertControlledIllustrationScientificContract/);
  assert.match(edge, /spatialRelationshipsCorrect/);
  assert.match(edge, /noScientificContradiction/);
  assert.match(edge, /noExtraScientificObjects/);
  assert.match(edge, /لم يعتمد واثق أي رسم خطي بديل/);
  assert.match(edge, /wathiq-phase3-2d-scientific-visual-v5/);
});
