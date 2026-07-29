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

function buildLayoutFixture({ damagedCodes = false } = {}) {
  const words = [];
  addRtlLine(words, "المحتويات", "right", 40);

  let y = 120;
  const right = damagedCodes ? [
    "الوحدة الأولى: الشحنة الكهربائية",
    "١ - ١ الكهرباء الساكنة ١٥",
    "٢ ـ ١ الاحتكاك والشحن الكهربائي ١٨",
    "المجالات الكهربائية والشحنة",
    "الكهربائية ١٩",
    "٤ ١ الموصلات الكهربائية والعوازل ٢٠",
    "الوحدة الثانية: مخططات الدوائر الكهربائية",
    "مكونات الدائرة الكهربائية ٢٢",
    "توصيل المقاومات ٢٩",
    "الوحدة الثالثة: مخاطر الكهرباء",
    "المخاطر الكهربائية ٣٨",
    "المنصهرات ٣٩",
    "الوحدة الرابعة: تأثيرات القوى",
    "١-٤ القوى المؤثرة على قطار الملاهي ٤٢",
    "القوى المؤثرة على المركبة الفضائية ٤٤",
    "٣-٤ القوة والكتلة والتسارع ٤٩",
    "٤-٤ استطالة الزنبرك ٥١",
    "٥-٤ قانون هوك ٥٤",
    "الوحدة الخامسة: عزم القوة ومركز الكتلة",
    "١-٥ عزم القوة ٥٨",
    "٢-٥ حساب عزم القوة ٦١",
    "٣-٥ الاستقرار ومركز الكتلة ٦٤",
  ] : [
    "الوحدة الأولى: الشحنة الكهربائية",
    "١ - ١ الكهرباء الساكنة ١٥",
    "٢-١ الاحتكاك والشحن الكهربائي ١٨",
    "٣-١ المجالات الكهربائية والشحنة",
    "الكهربائية ١٩",
    "٤-١ الموصلات الكهربائية والعوازل ٢٠",
    "الوحدة الثانية: مخططات الدوائر الكهربائية",
    "١-٢ مكونات الدائرة الكهربائية ٢٢",
    "٢-٢ توصيل المقاومات ٢٩",
    "الوحدة الثالثة: مخاطر الكهرباء",
    "١-٣ المخاطر الكهربائية ٣٨",
    "٢-٣ المنصهرات ٣٩",
    "الوحدة الرابعة: تأثيرات القوى",
    "١-٤ القوى المؤثرة على قطار الملاهي ٤٢",
    "٢-٤ القوى المؤثرة على المركبة الفضائية ٤٤",
    "٣-٤ القوة والكتلة والتسارع ٤٩",
    "٤-٤ استطالة الزنبرك ٥١",
    "٥-٤ قانون هوك ٥٤",
    "الوحدة الخامسة: عزم القوة ومركز الكتلة",
    "١-٥ عزم القوة ٥٨",
    "٢-٥ حساب عزم القوة ٦١",
    "٣-٥ الاستقرار ومركز الكتلة ٦٤",
  ];
  for (const line of right) { addRtlLine(words, line, "right", y); y += 42; }

  y = 120;
  const left = [
    "الوحدة السادسة: الشغل والقدرة",
    "١-٦ الشغل المبذول ٧١",
    "٢-٦ حساب الشغل المبذول ٧٣",
    "٣-٦ القدرة ٧٦",
    "الوحدة السابعة: الضغط",
    "١-٧ الضغط على سطح ٧٩",
    "٢-٧ حساب الضغط ٨٠",
    "الوحدة الثامنة: فيزياء النواة",
    "١-٨ بنية النواة ٨٢",
    "الوحدة التاسعة: النشاط الإشعاعي",
    "١-٩ النشاط الإشعاعي في كل مكان ٨٨",
    "٢-٩ فهم النشاط الإشعاعي ٩٣",
    "٣-٩ استخدام النظائر المشعة ٩٧",
    "الوحدة العاشرة: الاضمحلال الإشعاعي وعمر",
    "النصف",
    "١-١٠ تناقص النشاط الإشعاعي مع مرور",
    "الزمن ١٠٢",
    "٢-١٠ معادلات الاضمحلال الإشعاعي ١٠٣",
    "٣-١٠ عمر النصف للمادة المشعة ١٠٣",
    "الوحدة الحادية عشرة: احتياطات السلامة",
    "١-١١ التعامل الآمن ١٠٩",
    "مصطلحات علمية ١١٣",
    "ملحق ١١٥",
  ];
  for (const line of left) { addRtlLine(words, line, "left", y); y += 42; }

  return { pageNumber: 12, width: pageWidth, height: pageHeight, words, provider: "fixture", processedAt: "2026-07-28T00:00:00.000Z" };
}

function assertGoldenResult(result) {
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
  assert.ok(result.nodes.every((node) => !/مصطلحات علمية|ملحق/.test(node.title)));
}

test("يفصل الفهرس البصري إلى عمودين", () => {
  const columns = layoutPageToColumns(buildLayoutFixture());
  assert.ok(columns.right.length > 15);
  assert.ok(columns.left.length > 15);
});

test("المرجع الذهبي الحقيقي ينتج 11 وحدة و29 درسًا دون فقد الوحدة الأولى", () => {
  assertGoldenResult(extractStructureFromPositionalToc("source-1", [buildLayoutFixture()], 124));
});

test("يسترد الدروس مكانيًا عند حذف Vision رموز الوحدتين 2 و3 وفقد رمز الدرس 2 من الوحدة 4", () => {
  assertGoldenResult(extractStructureFromPositionalToc("source-1", [buildLayoutFixture({ damagedCodes: true })], 124));
});

test("يفهم الشرطة العربية الطويلة أو رقمي الدرس المنفصلين بلا شرطة", () => {
  const result = extractStructureFromPositionalToc("source-1", [buildLayoutFixture({ damagedCodes: true })], 124);
  const lessons = result.nodes.filter((node) => node.nodeType === "درس");
  assert.equal(lessons[1]?.title, "2-1 الاحتكاك والشحن الكهربائي");
  assert.equal(lessons[3]?.title, "4-1 الموصلات الكهربائية والعوازل");
});

test("يرفض الفهرس إذا فُقدت الوحدة الأولى", () => {
  const page = buildLayoutFixture();
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
