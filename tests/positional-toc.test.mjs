import test from "node:test";
import assert from "node:assert/strict";
import { detectTocPagesFromChunks, extractStructureFromPositionalToc, layoutPageToColumns } from "../dist/assets/positional-toc.js";

const pageWidth = 1200;
const pageHeight = 1700;

function addRtlLine(words, text, column, y, confidence = 0.97) {
  const tokens = text.split(/\s+/).filter(Boolean);
  let cursor = column === "right" ? 1130 : 530;
  for (const token of tokens) {
    const width = Math.max(22, token.length * 13);
    words.push({ text: token, xMin: cursor - width, xMax: cursor, yMin: y, yMax: y + 25, confidence });
    cursor -= width + 11;
  }
}

function layoutFixture() {
  const words = [];
  addRtlLine(words, "المحتويات", "right", 40);

  let y = 120;
  const right = [
    ["الوحدة الأولى: الشحنة الكهربائية", null],
    ["١ - ١ الكهرباء الساكنة ١٥", 1],
    ["٢-١ الاحتكاك والشحن الكهربائي ١٨", 1],
    ["٣-١ المجالات الكهربائية والشحنة", 1],
    ["الكهربائية ١٩", 1],
    ["٤-١ الموصلات الكهربائية والعوازل ٢٠", 1],
    ["الوحدة الثانية: مخططات الدوائر الكهربائية", null],
    ["١-٢ مكونات الدائرة الكهربائية ٢٢", 2],
    ["٢-٢ توصيل المقاومات ٢٦", 2],
    ["الوحدة الثالثة: مخاطر الكهرباء", null],
    ["١-٣ المخاطر الكهربائية ٢٨", 3],
    ["٢-٣ المنصهرات ٢٩", 3],
    ["الوحدة الرابعة: تأثيرات القوى", null],
    ["١-٤ القوى المؤثرة على قطار الملاهي ٤٣", 4],
    ["٢-٤ القوى المؤثرة على المركبة الفضائية ٤٤", 4],
    ["٣-٤ القوة والكتلة والتسارع ٤٩", 4],
    ["٤-٤ استطالة الزنبرك ٥١", 4],
    ["٥-٤ قانون هوك ٥٤", 4],
    ["الوحدة الخامسة: عزم القوة ومركز الكتلة", null],
    ["١-٥ عزم القوة ٥٨", 5],
    ["٢-٥ حساب عزم القوة ٦١", 5],
    ["٣-٥ الاستقرار ومركز الكتلة ٦٤", 5],
  ];
  for (const [line] of right) { addRtlLine(words, line, "right", y); y += 42; }

  y = 120;
  const left = [
    ["الوحدة السادسة: الشغل والقدرة", null],
    ["١-٦ الشغل المبذول ٧١", 6],
    ["٢-٦ حساب الشغل المبذول ٧٣", 6],
    ["٣-٦ القدرة ٧٦", 6],
    ["الوحدة السابعة: الضغط", null],
    ["١-٧ الضغط على سطح ٧٩", 7],
    ["٢-٧ حساب الضغط ٨٠", 7],
    ["الوحدة الثامنة: فيزياء النواة", null],
    ["١-٨ بنية النواة ٨٢", 8],
    ["الوحدة التاسعة: النشاط الإشعاعي", null],
    ["١-٩ النشاط الإشعاعي في كل مكان ٨٨", 9],
    ["٢-٩ فهم النشاط الإشعاعي ٩٣", 9],
    ["٣-٩ استخدام النظائر المشعة ٩٧", 9],
    ["الوحدة العاشرة: الاضمحلال الإشعاعي وعمر", null],
    ["النصف", null],
    ["١-١٠ تناقص النشاط الإشعاعي مع مرور", 10],
    ["الزمن ١٠٢", 10],
    ["٢-١٠ معادلات الاضمحلال الإشعاعي ١٠٣", 10],
    ["٣-١٠ عمر النصف للمادة المشعة ١٠٦", 10],
    ["الوحدة الحادية عشرة: احتياطات السلامة", null],
    ["١-١١ التعامل الآمن ١٠٩", 11],
  ];
  for (const [line] of left) { addRtlLine(words, line, "left", y); y += 42; }

  return { pageNumber: 12, width: pageWidth, height: pageHeight, words, provider: "fixture", processedAt: "2026-07-28T00:00:00.000Z" };
}

test("يفصل الفهرس البصري إلى عمودين", () => {
  const columns = layoutPageToColumns(layoutFixture());
  assert.ok(columns.right.length > 15);
  assert.ok(columns.left.length > 15);
});

test("المرجع الذهبي ينتج 11 وحدة و29 درسًا دون فقد الوحدة الأولى", () => {
  const result = extractStructureFromPositionalToc("source-1", [layoutFixture()], 124);
  assert.equal(result.reliableTocFound, true, result.message);
  const units = result.nodes.filter((node) => node.nodeType === "وحدة");
  const lessons = result.nodes.filter((node) => node.nodeType === "درس");
  assert.equal(units.length, 11);
  assert.equal(lessons.length, 29);
  assert.equal(units[0]?.title, "الوحدة الأولى: الشحنة الكهربائية");
  assert.equal(units[0]?.pageStart, 15);
  assert.equal(units.at(-1)?.title, "الوحدة الحادية عشرة: احتياطات السلامة");
  assert.equal(units.at(-1)?.pageStart, 109);
  assert.equal(lessons[0]?.title, "1-1 الكهرباء الساكنة");
  assert.equal(lessons[2]?.title, "3-1 المجالات الكهربائية والشحنة الكهربائية");
  assert.equal(lessons.at(-1)?.title, "1-11 التعامل الآمن");
  assert.ok(result.nodes.every((node) => !/\s\d{2,3}$/.test(node.title)));
});

test("يرفض الفهرس إذا فُقدت الوحدة الأولى", () => {
  const page = layoutFixture();
  page.words = page.words.filter((word) => word.yMin > 120 || word.xMax < 600);
  const result = extractStructureFromPositionalToc("source-1", [page], 124);
  assert.equal(result.reliableTocFound, false);
  assert.equal(result.nodes.length, 0);
  assert.match(result.message, /تسلسل الوحدات ناقص/);
});


test("يكتشف صفحة المحتويات المبكرة قبل تشغيل OCR الموضعي", () => {
  const chunks = [
    { chunkIndex: 0, pageFrom: 11, pageTo: 11, content: "مقدمة الكتاب", characterCount: 12 },
    { chunkIndex: 1, pageFrom: 12, pageTo: 12, content: "المحتويات الوحدة الأولى الوحدة الثانية ١-١ ٢-١ ١-٢", characterCount: 60 },
    { chunkIndex: 2, pageFrom: 37, pageTo: 37, content: "الوحدة الثانية: مخططات الدوائر الكهربائية", characterCount: 45 },
  ];
  assert.deepEqual(detectTocPagesFromChunks(chunks, 124), [12]);
});
