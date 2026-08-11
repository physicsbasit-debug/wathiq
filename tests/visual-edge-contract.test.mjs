import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const text = (relativePath) => readFile(new URL(relativePath, root), "utf8");

function extractParseJson(source) {
  const start = source.indexOf("function parseJson(value: string): unknown {");
  const end = source.indexOf("\nasync function requireUser", start);
  assert.ok(start >= 0 && end > start);
  const functionSource = source.slice(start, end)
    .replace("function parseJson(value: string): unknown", "function parseJson(value)");
  return new Function("httpError", `${functionSource}; return parseJson;`)((message) => new Error(message));
}

test("مراجع المشهد السياقي يقرأ JSON حتى مع سياج Markdown أو نص زائد", async () => {
  const edge = await text("supabase/functions/science-visual-generation/index.ts");
  const parseJson = extractParseJson(edge);
  assert.deepEqual(parseJson('```json\n{"approved":true,"reason":"ok"}\n```'), { approved: true, reason: "ok" });
  assert.deepEqual(parseJson('نتيجة المراجعة:\n{"approved":false,"reason":"راجع الاتجاه"}\nتم.'), { approved: false, reason: "راجع الاتجاه" });
});

test("عامل المفردات يطلب بيانات منظمة للرسوم العلمية الدقيقة ويمنع فقد قيم القوى", async () => {
  const worker = await text("supabase/functions/assessment-generation-worker/index.ts");
  assert.match(worker, /force_diagram/);
  assert.match(worker, /components/);
  assert.match(worker, /annotations/);
  assert.match(worker, /vectors/);
  assert.match(worker, /magnitude/);
  assert.match(worker, /unit/);
  assert.match(worker, /رسم القوى لا يحمل كل القيم العددية الواردة في السؤال/);
  assert.match(worker, /illustration_2d فقط للمشهد السياقي/);
});
