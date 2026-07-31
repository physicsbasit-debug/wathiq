import test from "node:test";
import assert from "node:assert/strict";
import { buildLessonCatalog, selectedLessonIds, selectedLessonLabels } from "../dist/assets/lesson-catalog.js";

function source(overrides = {}) {
  return {
    id: "source-physics",
    title: "كتاب الطالب للفيزياء",
    detectedHeadings: [],
    ...overrides,
  };
}

function node(overrides = {}) {
  return {
    id: "lesson-1",
    sourceId: "source-physics",
    parentId: "unit-1",
    nodeType: "درس",
    title: "1-1 الكهرباء الساكنة",
    pageStart: 15,
    pageEnd: 18,
    orderIndex: 1,
    confidence: 0.96,
    reviewStatus: "مرشح",
    extractionMethod: "toc-golden-4",
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
    ...overrides,
  };
}

test("يبني قائمة الدروس من هيكل موثوق ويحافظ على رقم الدرس واسمه وصفحاته", () => {
  const unit = node({ id: "unit-1", parentId: null, nodeType: "وحدة", title: "الوحدة الأولى: الشحنة الكهربائية", pageStart: 15, pageEnd: 24, orderIndex: 0 });
  const structures = new Map([["source-physics", [unit, node()]]]);
  const result = buildLessonCatalog([source()], structures);
  assert.equal(result.length, 1);
  assert.equal(result[0].label, "1-1 الكهرباء الساكنة");
  assert.equal(result[0].pageStart, 15);
  assert.equal(result[0].pageEnd, 18);
  assert.equal(result[0].origin, "validated-structure");
});

test("يفضل الدرس المعتمد ويرفض المرشح منخفض الثقة", () => {
  const structures = new Map([["source-physics", [
    node({ id: "low", title: "1-1 عنوان ضعيف", confidence: 0.7 }),
    node({ id: "approved", title: "1-2 عنوان معتمد", confidence: 0.8, reviewStatus: "معتمد" }),
  ]]]);
  const result = buildLessonCatalog([source()], structures);
  assert.deepEqual(result.map((item) => item.label), ["1-2 عنوان معتمد"]);
  assert.equal(result[0].origin, "approved-structure");
});

test("يستخدم العناوين النصية المرقمة فقط عندما لا يوجد هيكل صالح", () => {
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
});

test("يحوّل الاختيارات بين المعرفات والعناوين دون إدخال يدوي", () => {
  const options = buildLessonCatalog([source({ detectedHeadings: ["1-1 الكهرباء الساكنة", "1-2 الاحتكاك والشحن الكهربائي"] })]);
  const ids = selectedLessonIds(options, ["1-2 الاحتكاك والشحن الكهربائي"]);
  assert.equal(ids.length, 1);
  assert.deepEqual(selectedLessonLabels(options, ids), ["1-2 الاحتكاك والشحن الكهربائي"]);
});

test("يكمل الشجرة الجزئية بعناوين الدروس المرقمة ويضعها داخل الوحدة الصحيحة", () => {
  const unit = node({ id: "unit-1", parentId: null, nodeType: "وحدة", title: "الوحدة الأولى: الشحنة الكهربائية", pageStart: 15, pageEnd: 24, orderIndex: 0 });
  const structures = new Map([["source-physics", [unit, node()]]]);
  const result = buildLessonCatalog([source({ detectedHeadings: [
    "1-1 الكهرباء الساكنة",
    "1-2 الاحتكاك والشحن الكهربائي",
  ] })], structures);
  assert.deepEqual(result.map((item) => item.label), [
    "1-1 الكهرباء الساكنة",
    "1-2 الاحتكاك والشحن الكهربائي",
  ]);
  assert.equal(result[1].unitLabel, "الوحدة الأولى: الشحنة الكهربائية");
  assert.equal(result[1].origin, "detected-heading");
});

test("لا يكرر رمز الدرس عند اختلاف صياغة العنوان ويفضل الهيكل الموثوق", () => {
  const unit = node({ id: "unit-1", parentId: null, nodeType: "وحدة", title: "الوحدة الأولى: الشحنة الكهربائية", pageStart: 15, pageEnd: 24, orderIndex: 0 });
  const structures = new Map([["source-physics", [unit, node({ reviewStatus: "معتمد", confidence: 1 })]]]);
  const result = buildLessonCatalog([source({ detectedHeadings: ["1-1 درس الكهرباء الساكنة"] })], structures);
  assert.equal(result.length, 1);
  assert.equal(result[0].label, "1-1 الكهرباء الساكنة");
  assert.equal(result[0].origin, "approved-structure");
});

test("يعرض الدرس المكتشف حتى عند غياب عقدة الوحدة كاملة", () => {
  const result = buildLessonCatalog([source({ detectedHeadings: ["2-3 تطبيقات الدوائر الكهربائية"] })]);
  assert.equal(result.length, 1);
  assert.equal(result[0].unitLabel, "الوحدة 2");
});
