import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTocDraft,
  composeStructureTitle,
  convertTocDraftRows,
  splitStructureTitle,
} from "../dist/assets/toc-draft-builder.js";
import { validateSourceStructureForApproval } from "../dist/assets/source-structure.js";

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

function buildDamagedLayoutFixture() {
  const words = [];
  addRtlLine(words, "المحتويات", "right", 40);
  let y = 120;
  const right = [
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
  return { pageNumber: 12, width: pageWidth, height: pageHeight, words, provider: "fixture", processedAt: "2026-07-29T00:00:00.000Z" };
}

test("يبني مسودة قابلة للتحرير حتى مع حذف رموز OCR", () => {
  const draft = buildTocDraft([buildDamagedLayoutFixture()]);
  assert.equal(draft.rows.filter((row) => row.rowType === "وحدة").length, 11);
  assert.equal(draft.rows.filter((row) => row.rowType === "درس").length, 29);
  assert.equal(draft.rows.find((row) => row.title === "مكونات الدائرة الكهربائية")?.code, "1-2");
  assert.equal(draft.rows.find((row) => row.title === "القوى المؤثرة على المركبة الفضائية")?.code, "2-4");
  assert.match(draft.message, /لم تُحفظ أي نتيجة بعد/);
});

test("يحوّل المسودة إلى هيكل صالح للاعتماد بعد المراجعة", () => {
  const draft = buildTocDraft([buildDamagedLayoutFixture()]);
  const converted = convertTocDraftRows("source-1", draft.rows, 124);
  assert.deepEqual(converted.issues, []);
  assert.equal(converted.nodes.filter((node) => node.nodeType === "وحدة").length, 11);
  assert.equal(converted.nodes.filter((node) => node.nodeType === "درس").length, 29);
  assert.equal(validateSourceStructureForApproval(converted.nodes).valid, true);
  assert.equal(converted.nodes[0]?.pageStart, 15);
  assert.equal(converted.nodes.at(-1)?.title, "1-11 التعامل الآمن");
});

test("يفصل رمز الدرس عن العنوان ويعيد تركيبه دون تغيير", () => {
  assert.deepEqual(splitStructureTitle("2-4 القوى المؤثرة على المركبة الفضائية"), {
    code: "2-4",
    title: "القوى المؤثرة على المركبة الفضائية",
  });
  assert.equal(composeStructureTitle("٢ ـ ٤", "القوى المؤثرة على المركبة الفضائية"), "2-4 القوى المؤثرة على المركبة الفضائية");
});

test("يرفض الاعتماد إذا بقيت وحدة بلا دروس لكنه لا يحذف المسودة", () => {
  const draft = buildTocDraft([buildDamagedLayoutFixture()]);
  draft.rows = draft.rows.filter((row) => row.title !== "مكونات الدائرة الكهربائية" && row.title !== "توصيل المقاومات");
  const converted = convertTocDraftRows("source-1", draft.rows, 124);
  const validation = validateSourceStructureForApproval(converted.nodes);
  assert.equal(validation.valid, false);
  assert.match(validation.issues.join(" "), /بلا دروس/);
  assert.ok(converted.nodes.some((node) => node.title.includes("الوحدة الثانية")));
});
