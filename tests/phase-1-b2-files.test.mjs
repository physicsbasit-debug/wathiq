import assert from "node:assert/strict";
import test from "node:test";
import { readFile, stat } from "node:fs/promises";

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const policy = await readFile(new URL("../src/assessment-policy.ts", import.meta.url), "utf8");
const domain = await readFile(new URL("../src/domain.ts", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");
const build = await readFile(new URL("../scripts/build.mjs", import.meta.url), "utf8");
const reference = await stat(new URL("../references/science-assessment-policy-2025-2026.pdf", import.meta.url));

const forbidden = `${app}\n${policy}\n${domain}\n${edge}`;

test("يضيف واثق مرجع التقويم الرسمي في واجهة مستقلة", () => {
  assert.match(app, /مرجع تقويم العلوم/);
  assert.match(app, /فتح الوثيقة الأصلية/);
  assert.match(app, /data-nav="policy"/);
  assert.ok(reference.size > 100_000);
  assert.match(build, /dist\/references/);
});

test("يبني الاختبار القصير من قالب رسمي لا من أعداد حرة", () => {
  assert.match(policy, /oman-science-assessment-2025-2026/);
  assert.match(policy, /cognitiveMarks:\s*\{ معرفة: 4, تطبيق: 4, استدلال: 2 \}/);
  assert.match(domain, /officialSpec\.blueprint/);
  assert.match(app, /قالب واثق المتوافق مع الوثيقة/);
});

test("يثبت الخادم المرجع الرسمي ويستخدم Gemini دون أسرار داخل الملفات", () => {
  assert.match(edge, /assessmentPolicyId/);
  assert.match(edge, /generativelanguage\.googleapis\.com\/v1\/interactions/);
  assert.match(edge, /GEMINI_API_KEY/);
  assert.doesNotMatch(forbidden, /AIza[0-9A-Za-z_-]{20,}|OPENAI_API_KEY|api\.openai\.com/);
});
