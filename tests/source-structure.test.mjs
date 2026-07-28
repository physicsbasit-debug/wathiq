import test from "node:test";
import assert from "node:assert/strict";
import {
  chunksToPageTexts,
  cleanStructureTitle,
  createManualStructureNode,
  extractSourceStructure,
  validateSourceStructure,
} from "../dist/assets/source-structure.js";

function chunk(chunkIndex, pageFrom, content) {
  return { chunkIndex, pageFrom, pageTo: pageFrom, content, characterCount: content.length };
}

test("ينظف العنوان من نقاط الفهرس دون حذف نصه", () => {
  assert.equal(cleanStructureTitle("  الوحدة الأولى: الشحنة الكهربائية ....  "), "الوحدة الأولى: الشحنة الكهربائية");
});

test("يعيد تركيب نص الصفحة من مقاطع متداخلة", () => {
  const pages = chunksToPageTexts([
    chunk(0, 4, "المحتويات\nالوحدة الأولى: الشحنة الكهربائية .... 17\nالوحدة الثانية:"),
    chunk(1, 4, "الوحدة الثانية: مخططات الدوائر الكهربائية .... 25"),
  ]);
  assert.equal(pages.length, 1);
  assert.match(pages[0].content, /الوحدة الأولى/);
  assert.match(pages[0].content, /الوحدة الثانية/);
});

test("يستخرج وحدات ودروسًا من صفحة المحتويات دون تكرار أرقام الصفحات داخل العنوان", () => {
  const text = `
المحتويات
الوحدة الأولى: الشحنة الكهربائية ........ 17
الدرس الأول: الشحنات والقوى ........ 19
نشاط عملي: فحص الشحنات ........ 22
مراجعة الوحدة الأولى ........ 24
الوحدة الثانية: مخططات الدوائر الكهربائية ........ 25
2.1 مكونات الدائرة الكهربائية ........ 27
2.2 التوصيل على التوالي ........ 31
أسئلة الوحدة الثانية ........ 38
الوحدة الثالثة: مخاطر الكهرباء ........ 39
الوحدة الرابعة: تأثيرات القوى ........ 45
`;
  const result = extractSourceStructure("source-physics", [chunk(0, 3, text)], 124);
  const units = result.nodes.filter((node) => node.nodeType === "وحدة");
  assert.equal(units.length, 4);
  assert.equal(units[0].title, "الوحدة الأولى: الشحنة الكهربائية");
  assert.equal(units[0].pageStart, 17);
  assert.equal(units[0].pageEnd, 24);
  assert.ok(result.nodes.some((node) => node.nodeType === "درس" && node.parentId === units[0].id));
  assert.ok(result.nodes.some((node) => node.title === "2.1 مكونات الدائرة الكهربائية"));
  assert.ok(result.nodes.every((node) => !/\s\d+$/.test(node.title)));
  assert.deepEqual(result.tocPages, [3]);
  assert.equal(result.usedFallback, false);
});

test("يستبعد صفحات الحقوق والمقدمة من الهيكل", () => {
  const result = extractSourceStructure("source-1", [
    chunk(0, 1, "حقوق الطباعة والنشر 2026\nمطبعة جامعة كامبريدج"),
    chunk(1, 2, "المحتويات\nالوحدة الأولى: المادة .... 8\nالدرس الأول: حالات المادة .... 10\nالوحدة الثانية: الطاقة .... 20"),
  ], 40);
  assert.equal(result.nodes.some((node) => /حقوق|مطبعة/.test(node.title)), false);
  assert.equal(result.nodes.filter((node) => node.nodeType === "وحدة").length, 2);
});

test("يستخدم مسح العناوين كخطة احتياطية عند غياب صفحة محتويات واضحة", () => {
  const result = extractSourceStructure("source-2", [
    chunk(0, 5, "الوحدة الأولى: المادة\nشرح علمي طويل"),
    chunk(1, 8, "الدرس الأول: حالات المادة\nشرح الدرس"),
    chunk(2, 20, "الوحدة الثانية: الطاقة\nشرح علمي"),
  ], 35);
  assert.equal(result.usedFallback, true);
  assert.equal(result.nodes.filter((node) => node.nodeType === "وحدة").length, 2);
});

test("يرفض اعتماد هيكل بلا وحدة أو بنطاق صفحات معطوب", () => {
  const node = createManualStructureNode("source-3", "درس", null, 3, 0);
  const invalid = validateSourceStructure([{ ...node, title: "", pageEnd: 2 }]);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.issues.length >= 2);
});
