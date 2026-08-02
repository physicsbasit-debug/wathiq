import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("يثبت إصدار Phase 2-A Fix 3 دون تغيير عقد V2", () => {
  assert.match(pkg.version, /^0\.0\.(?:51|52|53|54|55|56)$/);
  assert.match(edge, /source-grounded-policy-ai-17-whole-exam-v2/);
});

test("يمتلك الخادم مطبعًا حتميًا لإحالات الرسوم المتنوعة", () => {
  assert.match(edge, /function normalizeVisualQuestionReference\(/);
  assert.match(edge, /function visualReferencePrefix\(/);
  assert.match(edge, /بالاستعانة بمخطط القوى المرفق/);
  assert.match(edge, /بالاستعانة بالجدول المرفق/);
  assert.match(edge, /بالاستعانة بالرسم البياني المرفق/);
  assert.match(edge, /بالاستعانة بتدريج الجهاز المرفق/);
});

test("يطبّع السؤال قبل التحقق ولا يعيد رسالة الرفض الشكلية القديمة", () => {
  assert.match(edge, /const visualReference = normalizeVisualQuestionReference\(/);
  assert.match(edge, /alternative = \{/);
  assert.doesNotMatch(edge, /السؤال البصري لا يعتمد صراحة على الشكل المرفق/);
});
