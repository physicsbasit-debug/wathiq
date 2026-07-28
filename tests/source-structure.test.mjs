import test from "node:test";
import assert from "node:assert/strict";
import {
  chunksToPageTexts,
  cleanStructureTitle,
  createManualStructureNode,
  extractSourceStructure,
  parsePageSelection,
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
  assert.equal(result.nodes.some((node) => node.nodeType === "درس"), false);
  assert.equal(result.manualTocRequired, true);
});

test("يرفض صفحات المعادلات والرموز ولا يحولها إلى وحدات", () => {
  const result = extractSourceStructure("source-noise", [
    chunk(0, 34, "H 1 0 1 1\nH 1 1 2 1\nHe 2 شيئًا 9\nHe 2 يبين الشكل 3-8 ذرات نظيري الهيليوم"),
    chunk(1, 35, "A 25 1.7 A 1.7 Ω\nΩ 5\nR 1 R 2 R 3 5 V\n40 + 1"),
    chunk(2, 88, "Po 206 84\nGamma decay 103\nR = 10 Ω\nHe 4 2"),
  ], 124);
  assert.equal(result.nodes.length, 0);
  assert.equal(result.manualTocRequired, true);
  assert.equal(result.reliableTocFound, false);
});

test("يستخرج من صفحات فهرس محددة يدويًا حتى لو غاب عنوان المحتويات", () => {
  const text = `
الوحدة الأولى: الشحنة الكهربائية .... 17
الدرس الأول: الشحنات والقوى .... 19
الوحدة الثانية: مخططات الدوائر الكهربائية .... 25
2.1 مكونات الدائرة الكهربائية .... 27
`;
  const result = extractSourceStructure("source-manual", [chunk(0, 4, text)], 124, { tocPages: [4], allowUnitHeadingFallback: false });
  assert.equal(result.reliableTocFound, true);
  assert.deepEqual(result.tocPages, [4]);
  assert.equal(result.nodes.filter((node) => node.nodeType === "وحدة").length, 2);
  assert.ok(result.nodes.some((node) => node.nodeType === "درس"));
});

test("يفهم إدخال صفحات الفهرس العربية والنطاقات", () => {
  assert.deepEqual(parsePageSelection("٤-٦، ٩", 10), [4, 5, 6, 9]);
  assert.deepEqual(parsePageSelection("20-50", 60), []);
});

test("يدعم فهرسًا موثوقًا ممتدًا على صفحتين متتاليتين", () => {
  const result = extractSourceStructure("source-multipage", [
    chunk(0, 3, "المحتويات\nالوحدة الأولى: المادة .... 8\nالدرس الأول: حالات المادة .... 10\nالوحدة الثانية: الطاقة .... 20"),
    chunk(1, 4, "الدرس الأول: انتقال الطاقة .... 22\nنشاط عملي: قياس الطاقة .... 24\nالوحدة الثالثة: القوى .... 30"),
  ], 50);
  assert.deepEqual(result.tocPages, [3, 4]);
  assert.equal(result.nodes.filter((node) => node.nodeType === "وحدة").length, 3);
  assert.equal(result.reliableTocFound, true);
});

test("يرفض اعتماد هيكل بلا وحدة أو بنطاق صفحات معطوب", () => {
  const node = createManualStructureNode("source-3", "درس", null, 3, 0);
  const invalid = validateSourceStructure([{ ...node, title: "", pageEnd: 2 }]);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.issues.length >= 2);
});
