import test from "node:test";
import assert from "node:assert/strict";
import {
  chunksToPageTexts,
  cleanStructureTitle,
  createManualStructureNode,
  extractSourceStructure,
  parsePageSelection,
  shouldQuarantineLegacyStructureDraft,
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
  ], 35, { allowUnitHeadingFallback: true });
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


test("يعزل مسودة الهيكل القديمة المشوهة دون حذف الهيكل اليدوي أو المعتمد", () => {
  const base = createManualStructureNode("source-legacy", "وحدة", null, 2, 0);
  const legacyNoise = [
    { ...base, id: "legacy-1", title: "H 1 0 1 1", extractionMethod: "toc-heuristic-1", reviewStatus: "مرشح" },
    { ...base, id: "legacy-2", title: "A 25 1.7 A 1.7 Ω", extractionMethod: "toc-heuristic-1", reviewStatus: "مرشح" },
    { ...base, id: "legacy-3", title: "R 1 R 2 R 3 5 V", extractionMethod: "toc-heuristic-1", reviewStatus: "مرشح" },
  ];
  assert.equal(shouldQuarantineLegacyStructureDraft(legacyNoise), true);
  assert.equal(shouldQuarantineLegacyStructureDraft([{ ...base, title: "الوحدة الأولى: الشحنة الكهربائية", extractionMethod: "manual" }]), false);
  assert.equal(shouldQuarantineLegacyStructureDraft([{ ...base, title: "الوحدة الأولى: الشحنة الكهربائية", extractionMethod: "toc-heuristic-2", reviewStatus: "معتمد" }]), false);
});

test("يستخرج فهرسًا عربيًا متعدد الأعمدة اعتمادًا على ترقيم الوحدات والدروس دون الاعتماد على ترتيب OCR", () => {
  const text = `
الوحدة السادسة: الشغل والقدرة
٦-١ الشغل المبذول ٧١
٦-٢ حساب الشغل المبذول ٧٣
٦-٣ القدرة ٧٦
الوحدة السابعة: الضغط
٧-١ الضغط على سطح ٧٩
٧-٢ حساب الضغط ٨٠
الوحدة الثامنة: فيزياء النواة
٨-١ بنية الذرة ٨٣
المقدمة xi
كيف تستخدم هذا الكتاب xii
الوحدة الأولى: الشحنة الكهربائية
١-١ الكهرباء الساكنة ١٥
١-٢ الاحتكاك والشحن الكهربائي ١٨
١-٣ المجالات الكهربائية والشحنة الكهربائية ١٩
١-٤ الموصلات الكهربائية والعوازل ٢٠
الوحدة الثانية: مخططات الدوائر الكهربائية
٢-١ مكونات الدائرة الكهربائية ٢٢
٢-٢ توصيل المقاومات ٢٤
الوحدة الثالثة: مخاطر الكهرباء
٣-١ المخاطر الكهربائية ٣٨
٣-٢ الحماية من خطر الكهرباء ٣٩
الوحدة الرابعة: تأثيرات القوى
٤-١ القوى المؤثرة على قطار الملاهي ٤٢
٤-٢ القوى المؤثرة على المركبة الفضائية ٤٤
الوحدة الخامسة: عزم القوة ومركز الكتلة
٥-١ عزم القوة ٥٨
٥-٢ حساب عزم القوة ٦١
الوحدة التاسعة: النشاط الإشعاعي
٩-١ فهم النشاط الإشعاعي في كل مكان ٨٨
٩-٢ فهم النشاط الإشعاعي ٩٢
الوحدة العاشرة: الاضمحلال الإشعاعي وعمر النصف
١٠-١ تناقص الاضمحلال عبر مرور الزمن ١٠٢
١٠-٢ عمر النصف للمادة المشعة ١٠٣
الوحدة الحادية عشرة: احتياطات السلامة
١١-١ التفاعل الآمن ١٠٩
مصطلحات علمية ١١٣
ملحق ١١٥
`;
  const result = extractSourceStructure("source-visual-toc", [chunk(0, 4, text)], 124);
  const units = result.nodes.filter((node) => node.nodeType === "وحدة");
  const lessons = result.nodes.filter((node) => node.nodeType === "درس");
  assert.equal(result.reliableTocFound, true);
  assert.deepEqual(result.tocPages, [4]);
  assert.equal(units.length, 11);
  assert.equal(units[0].title, "الوحدة الأولى: الشحنة الكهربائية");
  assert.equal(units[10].title, "الوحدة الحادية عشرة: احتياطات السلامة");
  assert.equal(units[0].pageStart, 15);
  assert.equal(units[5].pageStart, 71);
  assert.ok(lessons.some((node) => node.title === "1-1 الكهرباء الساكنة" && node.parentId === units[0].id));
  assert.ok(lessons.some((node) => node.title === "11-1 التفاعل الآمن" && node.parentId === units[10].id));
  assert.ok(result.nodes.every((node) => !/\s(?:15|22|71|109)$/.test(node.title)));
});

test("يرتب فهرس العمودين حسب رقم الوحدة حتى لو بدأ OCR بالعمود الأيسر", () => {
  const text = `
الوحدة الخامسة: عزم القوة ومركز الكتلة
5-1 عزم القوة 58
5-2 حساب عزم القوة 61
الوحدة السادسة: الشغل والقدرة
6-1 الشغل المبذول 71
6-2 حساب الشغل المبذول 73
الوحدة السابعة: الضغط
7-1 الضغط على سطح 79
7-2 حساب الضغط 80
الوحدة الأولى: الشحنة الكهربائية
1-1 الكهرباء الساكنة 15
1-2 الاحتكاك والشحن الكهربائي 18
الوحدة الثانية: مخططات الدوائر الكهربائية
2-1 مكونات الدائرة الكهربائية 22
2-2 توصيل المقاومات 24
الوحدة الثالثة: مخاطر الكهرباء
3-1 المخاطر الكهربائية 38
3-2 الحماية من خطر الكهرباء 39
الوحدة الرابعة: تأثيرات القوى
4-1 القوى المؤثرة على قطار الملاهي 42
4-2 القوة والكتلة والتسارع 48
`;
  const result = extractSourceStructure("source-column-order", [chunk(0, 5, text)], 90, { tocPages: [5] });
  const units = result.nodes.filter((node) => node.nodeType === "وحدة");
  assert.equal(result.reliableTocFound, true);
  assert.deepEqual(units.map((node) => node.title), [
    "الوحدة الأولى: الشحنة الكهربائية",
    "الوحدة الثانية: مخططات الدوائر الكهربائية",
    "الوحدة الثالثة: مخاطر الكهرباء",
    "الوحدة الرابعة: تأثيرات القوى",
    "الوحدة الخامسة: عزم القوة ومركز الكتلة",
    "الوحدة السادسة: الشغل والقدرة",
    "الوحدة السابعة: الضغط",
  ]);
});

test("يدمج عناوين الوحدات المتكررة في صفحات المحتوى ولا يبقي رقم الصفحة داخل العنوان", () => {
  const result = extractSourceStructure("source-repeated-units", [
    chunk(0, 17, "الوحدة الأولى: الشحنة الكهربائية 17\nشرح علمي"),
    chunk(1, 19, "الوحدة الأولى: الشحنة الكهربائية 19\nشرح آخر"),
    chunk(2, 25, "الوحدة الثانية: مخططات الدوائر الكهربائية 25\nشرح"),
    chunk(3, 27, "الوحدة الثانية: مخططات الدوائر الكهربائية 27\nشرح"),
    chunk(4, 39, "الوحدة الثالثة: مخاطر الكهرباء 39\nشرح"),
  ], 50, { allowUnitHeadingFallback: true });
  const units = result.nodes.filter((node) => node.nodeType === "وحدة");
  assert.equal(result.usedFallback, true);
  assert.equal(units.length, 3);
  assert.deepEqual(units.map((node) => node.title), [
    "الوحدة الأولى: الشحنة الكهربائية",
    "الوحدة الثانية: مخططات الدوائر الكهربائية",
    "الوحدة الثالثة: مخاطر الكهرباء",
  ]);
});

test("يفهم رقم الصفحة قبل درس الفهرس أو في سطر مستقل", () => {
  const text = `
الوحدة الأولى: الشحنة الكهربائية
15 1-1 الكهرباء الساكنة
1-2 الاحتكاك والشحن الكهربائي
18
الوحدة الثانية: مخططات الدوائر الكهربائية
22
2-1 مكونات الدائرة الكهربائية
2-2 توصيل المقاومات 24
الوحدة الثالثة: مخاطر الكهرباء
38 3-1 المخاطر الكهربائية
3-2 الحماية من خطر الكهرباء 39
الوحدة الرابعة: تأثيرات القوى
4-1 القوى المؤثرة على قطار الملاهي 42
4-2 القوة والكتلة والتسارع 48
`;
  const result = extractSourceStructure("source-page-order", [chunk(0, 4, text)], 80, { tocPages: [4] });
  assert.equal(result.reliableTocFound, true);
  assert.ok(result.nodes.some((node) => node.title === "1-1 الكهرباء الساكنة" && node.pageStart === 15));
  assert.ok(result.nodes.some((node) => node.title === "1-2 الاحتكاك والشحن الكهربائي" && node.pageStart === 18));
  assert.ok(result.nodes.some((node) => node.title === "2-1 مكونات الدائرة الكهربائية" && node.pageStart === 22));
});


test("المرجع الذهبي لفهرس فيزياء الصف العاشر ينتج 11 وحدة و29 درسًا دون فقد الوحدة الأولى", () => {
  const text = `
الوحدة السادسة: الشغل والقدرة
٧١ الشغل المبذول ٦-١
٧٣ حساب الشغل المبذول ٦-٢
٧٦ القدرة ٦-٣
الوحدة السابعة: الضغط
٧٩ الضغط على سطح ٧-١
٨٠ حساب الضغط ٧-٢
الوحدة الثامنة: فيزياء النواة
٨٢ بنية النواة ٨-١
الوحدة التاسعة: النشاط الإشعاعي
٨٨ النشاط الإشعاعي في كل مكان ٩-١
٩٣ فهم النشاط الإشعاعي ٩-٢
٩٧ استخدام النظائر المشعة ٩-٣
الوحدة العاشرة: الاضمحلال الإشعاعي وعمر النصف
١٠٢ تناقص النشاط الإشعاعي مع مرور الزمن ١٠-١
١٠٣ معادلات الاضمحلال الإشعاعي ١٠-٢
١٠٣ عمر النصف للمادة المشعة ١٠-٣
الوحدة الحادية عشرة: احتياطات السلامة
١٠٩ التعامل الآمن ١١-١
المقدمة xi
كيف تستخدم هذا الكتاب xii
الوحدة الأولى: الشحنة الكهربائية
١٥ الكهرباء الساكنة ١-١
١٨ الاحتكاك والشحن الكهربائي ١-٢
١٩ المجالات الكهربائية والشحنة الكهربائية ١-٣
٢٠ الموصلات الكهربائية والعوازل ١-٤
الوحدة الثانية: مخططات الدوائر الكهربائية
٢٢ مكونات الدائرة الكهربائية ٢-١
٢٩ توصيل المقاومات ٢-٢
الوحدة الثالثة: مخاطر الكهرباء
٣٨ المخاطر الكهربائية ٣-١
٣٩ المنصهرات ٣-٢
الوحدة الرابعة: تأثيرات القوى
٤٢ القوى المؤثرة على قطار الملاهي ٤-١
٤٤ القوى المؤثرة على المركبة الفضائية ٤-٢
٤٩ القوة والكتلة والتسارع ٤-٣
٥١ استطالة الزنبرك ٤-٤
٥٤ قانون هوك ٤-٥
الوحدة الخامسة: عزم القوة ومركز الكتلة
٥٨ عزم القوة ٥-١
٦١ حساب عزم القوة ٥-٢
٦٤ الاستقرار ومركز الكتلة ٥-٣
`;
  const result = extractSourceStructure("golden-physics-grade10", [chunk(0, 4, text)], 124, { tocPages: [4] });
  const units = result.nodes.filter((node) => node.nodeType === "وحدة");
  const lessons = result.nodes.filter((node) => node.nodeType === "درس");
  assert.equal(result.reliableTocFound, true);
  assert.equal(result.usedFallback, false);
  assert.equal(units.length, 11);
  assert.equal(lessons.length, 29);
  assert.equal(units[0].title, "الوحدة الأولى: الشحنة الكهربائية");
  assert.equal(units[0].pageStart, 15);
  assert.equal(units[1].pageStart, 22);
  assert.equal(units[10].title, "الوحدة الحادية عشرة: احتياطات السلامة");
  assert.equal(units[10].pageStart, 109);
  assert.deepEqual(units.map((unit) => unit.title), [
    "الوحدة الأولى: الشحنة الكهربائية",
    "الوحدة الثانية: مخططات الدوائر الكهربائية",
    "الوحدة الثالثة: مخاطر الكهرباء",
    "الوحدة الرابعة: تأثيرات القوى",
    "الوحدة الخامسة: عزم القوة ومركز الكتلة",
    "الوحدة السادسة: الشغل والقدرة",
    "الوحدة السابعة: الضغط",
    "الوحدة الثامنة: فيزياء النواة",
    "الوحدة التاسعة: النشاط الإشعاعي",
    "الوحدة العاشرة: الاضمحلال الإشعاعي وعمر النصف",
    "الوحدة الحادية عشرة: احتياطات السلامة",
  ]);
  assert.ok(lessons.some((lesson) => lesson.title === "1-1 الكهرباء الساكنة" && lesson.pageStart === 15));
  assert.ok(lessons.some((lesson) => lesson.title === "11-1 التعامل الآمن" && lesson.pageStart === 109));
  assert.ok(result.nodes.every((node) => !/\s\d{1,4}$/.test(node.title)));
});

test("يرفض فهرسًا ناقصًا إذا ذُكرت الوحدة الأولى ولم تُستخرج دروسها", () => {
  const text = `
الوحدة الأولى: الشحنة الكهربائية
الوحدة الثانية: مخططات الدوائر الكهربائية
٢٢ مكونات الدائرة الكهربائية ٢-١
٢٩ توصيل المقاومات ٢-٢
الوحدة الثالثة: مخاطر الكهرباء
٣٨ المخاطر الكهربائية ٣-١
٣٩ المنصهرات ٣-٢
الوحدة الرابعة: تأثيرات القوى
٤٢ القوى المؤثرة على قطار الملاهي ٤-١
٤٤ القوى المؤثرة على المركبة الفضائية ٤-٢
`;
  const result = extractSourceStructure("incomplete-golden", [chunk(0, 4, text)], 80, { tocPages: [4] });
  assert.equal(result.reliableTocFound, false);
  assert.equal(result.nodes.length, 0);
  assert.equal(result.manualTocRequired, true);
});
