import test from "node:test";
import assert from "node:assert/strict";
import { buildLessonCatalog } from "../dist/assets/lesson-catalog.js";

function source(overrides = {}) {
  return {
    id: "source-physics",
    title: "كتاب الطالب للفيزياء",
    detectedHeadings: [],
    ...overrides,
  };
}

test("يقترح عناوين الدروس المرقمة من PDF دون بناء شجرة إلزامية", () => {
  const result = buildLessonCatalog([source({ detectedHeadings: [
    "الوحدة الأولى: الشحنة الكهربائية",
    "١-١ الكهرباء الساكنة",
    "1.2 الاحتكاك والشحن الكهربائي",
    "حقوق الطبع والنشر",
  ] })]);
  assert.deepEqual(result.map((item) => item.label), [
    "1-1 الكهرباء الساكنة",
    "1-2 الاحتكاك والشحن الكهربائي",
  ]);
  assert.ok(result.every((item) => item.origin === "detected-heading"));
});

test("يزيل تكرار عنوان الدرس داخل المصدر نفسه", () => {
  const result = buildLessonCatalog([source({ detectedHeadings: [
    "1-1 الكهرباء الساكنة",
    "١-١ الكهرباء الساكنة",
  ] })]);
  assert.equal(result.length, 1);
});

test("يبقي الاقتراحات اختيارية ولا يخترع درسًا من عنوان وحدة غير مرقم كدرس", () => {
  const result = buildLessonCatalog([source({ detectedHeadings: [
    "الوحدة الثانية: الكهرباء",
    "المحتويات",
    "2-3 تطبيقات الدوائر الكهربائية",
  ] })]);
  assert.deepEqual(result.map((item) => item.label), ["2-3 تطبيقات الدوائر الكهربائية"]);
});
