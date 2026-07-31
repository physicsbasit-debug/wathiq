import test from "node:test";
import assert from "node:assert/strict";
import { buildCuratedBookStructure, hasCuratedBookStructure } from "../dist/assets/book-content-tree.js";
import { buildLessonCatalog } from "../dist/assets/lesson-catalog.js";

function physicsBook(overrides = {}) {
  return {
    id: "physics-grade10-book",
    catalogCode: "WTH-OM-G10-PHY-STU-S1-V1-4P6K2A",
    title: "كتاب الطالب للفيزياء",
    kind: "كتاب الطالب",
    grade: 10,
    subjectId: "physics",
    semester: "الفصل الأول",
    fileName: "cls10_Phys_SB_P1.pdf",
    extractedPageCount: 124,
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
    ...overrides,
  };
}

test("يبني شجرة كتاب فيزياء الصف العاشر من 11 وحدة و29 درسًا", () => {
  const source = physicsBook();
  assert.equal(hasCuratedBookStructure(source), true);
  const nodes = buildCuratedBookStructure(source);
  const units = nodes.filter((node) => node.nodeType === "وحدة");
  const lessons = nodes.filter((node) => node.nodeType === "درس");
  assert.equal(units.length, 11);
  assert.equal(lessons.length, 29);
  assert.equal(units[0].title, "الوحدة الأولى: الشحنة الكهربائية");
  assert.equal(units[8].title, "الوحدة التاسعة: النشاط الإشعاعي");
  assert.ok(lessons.some((lesson) => lesson.title === "9-3 استخدام النظائر المشعة" && lesson.pageStart === 100));
  assert.ok(lessons.every((lesson) => lesson.reviewStatus === "معتمد" && lesson.extractionMethod.startsWith("curated:")));
});

test("ينقل الشجرة المعتمدة إلى قائمة الدروس مع الوحدة ونطاق الصفحات", () => {
  const source = physicsBook();
  const nodes = buildCuratedBookStructure(source);
  const catalog = buildLessonCatalog([source], new Map([[source.id, nodes]]));
  assert.equal(catalog.length, 29);
  const lesson = catalog.find((item) => item.code === "9-2");
  assert.equal(lesson?.title, "فهم النشاط الإشعاعي");
  assert.equal(lesson?.unitLabel, "الوحدة التاسعة: النشاط الإشعاعي");
  assert.equal(lesson?.pageStart, 96);
  assert.equal(lesson?.pageEnd, 99);
  assert.equal(lesson?.origin, "curated-book-tree");
});

test("لا يطبق شجرة الفيزياء على مصدر أو فصل مختلف", () => {
  assert.equal(buildCuratedBookStructure(physicsBook({ subjectId: "chemistry" })).length, 0);
  assert.equal(buildCuratedBookStructure(physicsBook({ semester: "الفصل الثاني" })).length, 0);
  assert.equal(buildCuratedBookStructure(physicsBook({ kind: "دليل المعلم" })).length, 0);
});


test("يحوّل ترقيم الكتاب المطبوع إلى صفحات PDF الفعلية بإزاحة ثابتة", () => {
  const nodes = buildCuratedBookStructure(physicsBook());
  const lesson71 = nodes.find((node) => node.nodeType === "درس" && node.title.startsWith("7-1 "));
  const lesson31 = nodes.find((node) => node.nodeType === "درس" && node.title.startsWith("3-1 "));
  assert.equal(lesson71?.pageStart, 82);
  assert.equal(lesson31?.pageStart, 41);
  assert.match(lesson71?.extractionMethod ?? "", /pdf-offset-3/);
});
