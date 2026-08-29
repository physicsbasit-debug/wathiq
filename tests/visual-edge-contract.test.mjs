import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const text = (relativePath) => readFile(new URL(relativePath, root), "utf8");

function functionBlock(source, name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `function ${name} should exist`);
  const rest = source.slice(match.index + match[0].length);
  const next = /\n(?:async\s+)?function\s+[A-Za-z0-9_]+\s*\(/.exec(rest);
  const end = next ? match.index + match[0].length + next.index : source.length;
  return source.slice(match.index, end);
}

function extractParseJson(source) {
  const block = functionBlock(source, "parseJson")
    .replace("function parseJson(value: string): unknown", "function parseJson(value)");
  return new Function("httpError", `${block}; return parseJson;`)((message) => new Error(message));
}

test("مراجع الصورة يقرأ JSON داخل Markdown أو نص زائد", async () => {
  const edge = await text("supabase/functions/science-visual-generation/index.ts");
  const parseJson = extractParseJson(edge);
  assert.deepEqual(parseJson('```json\n{"approved":true,"reason":"ok"}\n```'), { approved: true, reason: "ok" });
  assert.deepEqual(parseJson('نتيجة:\n{"approved":false,"reason":"راجع"}\nتم.'), { approved: false, reason: "راجع" });
});

test("generate_image و review_image منفصلان ولا يبقى المسار المركب القديم", async () => {
  const edge = await text("supabase/functions/science-visual-generation/index.ts");
  assert.match(edge, /action === "generate_image"/);
  assert.match(edge, /action === "review_image"/);
  assert.doesNotMatch(edge, /generateReviewedIllustration/);
  assert.doesNotMatch(edge, /generate_visual_illustration/);
  assert.doesNotMatch(functionBlock(edge, "handleGenerateImage"), /reviewImage\s*\(/);
  assert.doesNotMatch(functionBlock(edge, "handleReviewImage"), /generateImage\s*\(/);
});

test("review_image يتطلب assetPath ويتحقق من ملكية المسار", async () => {
  const edge = await text("supabase/functions/science-visual-generation/index.ts");
  const parser = functionBlock(edge, "parseReviewRequest");
  const handler = functionBlock(edge, "handleReviewImage");
  assert.match(parser, /requireText\(payload\.assetPath/);
  assert.match(handler, /expectedPathPrefix/);
  assert.match(handler, /request\.assetPath\.startsWith\(expectedPathPrefix\)/);
  assert.match(handler, /\.download\(request\.assetPath\)/);
});

test("strict VisualReview contract يرفض الحقول الناقصة أو النوع الخاطئ بـ 502", async () => {
  const edge = await text("supabase/functions/science-visual-generation/index.ts");
  const strict = functionBlock(edge, "requireVisualReview");
  for (const field of [
    "approved", "requiredObjectsPresent", "scientificRelationshipCorrect", "spatialRelationshipsCorrect",
    "noScientificContradiction", "noExtraScientificObjects", "clear2DComposition", "printReady",
    "forbiddenTextDetected", "noAnswerLeakage", "reason",
  ]) assert.match(strict, new RegExp(field));
  assert.match(strict, /typeof record\[field\] !== "boolean"/);
  assert.match(strict, /typeof record\.reason !== "string"/);
  assert.match(strict, /502/);
  assert.match(edge, /additionalProperties:\s*false/);
});

test("no output و JSON غير صالح أخطاء تقنية وليست scientific rejection", async () => {
  const edge = await text("supabase/functions/science-visual-generation/index.ts");
  const review = functionBlock(edge, "reviewImage");
  const parse = functionBlock(edge, "parseJson");
  assert.match(review, /if \(!output\)/);
  assert.match(review, /502/);
  assert.match(parse, /تعذر قراءة نتيجة المراجع العلمي/);
  assert.match(parse, /502/);
  assert.doesNotMatch(review, /scientific_rejection/);
});

test("approved=false الصحيح وحده ينتج scientific_rejection + correction", async () => {
  const edge = await text("supabase/functions/science-visual-generation/index.ts");
  const handler = functionBlock(edge, "handleReviewImage");
  assert.match(handler, /if \(review\.approved\)/);
  assert.match(handler, /status: "scientific_rejection"/);
  assert.match(handler, /reviewerCorrection\(review\)/);
});

test("الصورة المؤقتة لا تحمل validated=true ولا تحذف الأصل السابق", async () => {
  const edge = await text("supabase/functions/science-visual-generation/index.ts");
  const store = functionBlock(edge, "storeProvisionalImage");
  assert.doesNotMatch(store, /validated:\s*true/);
  assert.doesNotMatch(store, /previousAssetPath/);
  assert.doesNotMatch(store, /\.remove\(/);
});

test("تعليمات الصورة تحافظ على منع الرسم الخطي والأرقام المخترعة وكشف اتجاه الحل", async () => {
  const edge = await text("supabase/functions/science-visual-generation/index.ts");
  assert.match(edge, /لا يستخدم مولداً تخطيطياً خطياً/);
  assert.match(edge, /لا تخترع بيانات كمية داخل الصورة/);
  assert.match(edge, /لا تضف أسهماً أو رموز شحنة أو قيماً أو اتجاهات نتيجة من عندك/);
  assert.match(edge, /noAnswerLeakage/);
  assert.match(edge, /thinkingLevel: "HIGH"/);
});
