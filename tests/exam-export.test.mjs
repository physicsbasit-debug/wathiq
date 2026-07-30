import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStandaloneExamDocument,
  hasAvoidableAdjacentMultipleChoice,
  interleaveAssessmentItems,
  safeExportFileName,
} from "../dist/assets/exam-export.js";

const items = [
  { id: "m1", type: "اختيار من متعدد" },
  { id: "m2", type: "اختيار من متعدد" },
  { id: "s1", type: "إجابة قصيرة" },
  { id: "s2", type: "إجابة قصيرة" },
  { id: "l1", type: "إجابة طويلة" },
];

const isMcq = (item) => item.type === "اختيار من متعدد";

test("يفصل الاختيار من متعدد بأسئلة إنشائية متى كان ذلك ممكنًا", () => {
  const ordered = interleaveAssessmentItems(items, isMcq);
  assert.deepEqual(ordered.map((item) => item.id), ["m1", "s1", "m2", "s2", "l1"]);
  assert.equal(hasAvoidableAdjacentMultipleChoice(ordered, isMcq), false);
});

test("لا يدعي إمكان الفصل عندما يزيد عدد أسئلة الاختيار من متعدد", () => {
  const crowded = [
    { id: "m1", type: "اختيار من متعدد" },
    { id: "m2", type: "اختيار من متعدد" },
    { id: "m3", type: "اختيار من متعدد" },
    { id: "s1", type: "إجابة قصيرة" },
  ];
  const ordered = interleaveAssessmentItems(crowded, isMcq);
  assert.equal(hasAvoidableAdjacentMultipleChoice(ordered, isMcq), false);
  assert.equal(ordered.length, crowded.length);
});

test("ينشئ اسم ملف آمنًا ووثيقة RTL متوافقة مع Word والطباعة", () => {
  assert.equal(safeExportFileName('اختبار: فيزياء / صف 10?'), "اختبار-_فيزياء_-_صف_10");
  const html = buildStandaloneExamDocument({
    title: "اختبار_الفيزياء",
    bodyHtml: "<section>السؤال الأول</section>",
    kind: "student",
    approvedAt: "30 يوليو 2026",
  });
  assert.match(html, /dir="rtl"/);
  assert.match(html, /schemas-microsoft-com:office:word/);
  assert.match(html, /@page \{ size: A4/);
  assert.match(html, /نسخة معتمدة/);
  assert.match(html, /data-export-kind="student"/);
});
