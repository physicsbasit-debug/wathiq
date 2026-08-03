import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const edge = await readFile(new URL("../supabase/functions/generate-source-questions/index.ts", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const assessment = await readFile(new URL("../src/assessment-generation-v2.ts", import.meta.url), "utf8");

/**
 * اختبارات توصيف مؤقتة. الغرض منها تثبيت حدود المحرك السابق قبل إزالته،
 * لا الدفاع عن هذا السلوك. تُحذف هذه الاختبارات عند التحويل الإنتاجي النهائي.
 */
test("يثبت خط الأساس أن وظيفة التوليد السابقة متضخمة ومتعددة المسؤوليات", () => {
  assert.ok(edge.split("\n").length > 4_500);
  assert.match(edge, /function scopedGenerationRequest\(/);
  assert.match(edge, /const maxRounds = request\.generationMode === "whole_exam_v2" \? 3 : 2/);
  assert.match(edge, /sourceEvidenceId:\s*\{ type: "string" \}/);
  assert.match(edge, /generate_visual_illustration/);
});

test("يثبت خط الأساس أن الواجهة تنتظر طلب الاختبار الكامل ثم تتحول للمسار السابق بعد 12 مفردة", () => {
  assert.match(app, /questionGenerationService\.generateWholeExam\(request\)/);
  assert.match(app, /generationMode === "whole_exam_v2" && plan\.length > 12/);
  assert.match(app, /state\.draft\.generationMode = "legacy_items"/);
});

test("يثبت خط الأساس أن عقد الاختبار السابق يرسل جميع المراجع ضمن طلب واحد", () => {
  assert.match(assessment, /references: QuestionGenerationReference\[\]/);
  assert.match(assessment, /globalAssessmentReferences/);
  assert.match(assessment, /items: optimizedItems/);
});
