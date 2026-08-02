import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const text = (path) => readFile(new URL(path, root), "utf8");

test("يثبت الإصدار ومحرك المرئيات التقويمية المتقدمة", async () => {
  const pkg = JSON.parse(await text("package.json"));
  const types = await text("src/types.ts");
  const visual = await text("src/question-visual.ts");
  assert.match(pkg.version, /^0\.0\.(?:44|45|46|47|48|49|50|51|52|53)$/);
  for (const type of ["data_table", "instrument_scale", "ray_diagram", "force_diagram", "flow_diagram"]) {
    assert.match(types, new RegExp(type));
    assert.match(visual, new RegExp(type));
  }
  assert.match(types, /QuestionVisualRole/);
  assert.match(types, /QuestionVisualSeries/);
  assert.match(types, /QuestionVisualVector/);
});

test("يربط التوليد والخادم بأدوار المرئي وقوالبه الحتمية", async () => {
  const generator = await text("src/question-generation.ts");
  const edge = await text("supabase/functions/generate-source-questions/index.ts");
  assert.match(generator, /source-grounded-policy-ai-(?:12-advanced-visuals|13-trusted-enrichment|14-contextual-stimulus-alignment|15-controlled-hybrid-visuals|16-assessment-quality-context-diversity)/);
  assert.match(generator, /instrument_scale/);
  assert.match(generator, /ray_diagram/);
  assert.match(generator, /force_diagram/);
  assert.match(edge, /visualRoleForItem/);
  assert.match(edge, /scientificTableProfile/);
  assert.match(edge, /instrumentProfile/);
  assert.match(edge, /fixedVisual\.role/);
  assert.doesNotMatch(edge, /text2image|imagen|generateImage/i);
});

test("يبقي المرئيات قابلة للطباعة بالأبيض والأسود دون صور حرة", async () => {
  const styles = await text("src/styles.css");
  const visual = await text("src/question-visual.ts");
  assert.match(styles, /qv-table-cell/);
  assert.match(styles, /qv-scale-tick/);
  assert.match(styles, /qv-ray/);
  assert.match(styles, /qv-force-arrow/);
  assert.match(styles, /@media print/);
  assert.doesNotMatch(visual, /<image\b|data:image|https?:\/\//i);
});
