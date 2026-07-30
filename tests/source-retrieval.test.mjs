import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeArabicSearchText,
  rankSourceChunks,
  referenceSupportsLesson,
  isLikelyNavigationOrMetadataChunk,
  SOURCE_RETRIEVAL_VERSION,
  tokenizeArabicSearch,
} from "../dist/assets/source-retrieval.js";

const source = {
  id: "s1",
  catalogCode: "WTH-1",
  fingerprint: "f1",
  authority: "منهج عُماني",
  title: "كتاب الطالب للفيزياء",
  kind: "كتاب الطالب",
  mode: "file",
  grade: 10,
  subjectId: "physics",
  version: "1",
  semester: "الفصل الأول",
  rightsConfirmed: true,
  status: "مفهرس",
  drivePath: "x",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

function candidate(index, page, content) {
  return {
    source,
    chunk: { chunkIndex: index, pageFrom: page, pageTo: page, content, characterCount: content.length },
  };
}

test("يطبع النص العربي بصورة مستقرة للبحث", () => {
  assert.equal(normalizeArabicSearchText("الشُّحنةُ الكهربائيّة"), "الشحنه الكهرباييه");
  assert.deepEqual(tokenizeArabicSearch("درس الشحنة الكهربائية"), ["الشحنه", "الكهرباييه"]);
});

test("يرتب المقاطع المطابقة للموضوع قبل المقاطع العامة", () => {
  const result = rankSourceChunks("الشحنة الكهربائية", [
    candidate(0, 3, "مقدمة الكتاب وحقوق النشر"),
    candidate(1, 15, "تتكون الشحنة الكهربائية نتيجة انتقال الإلكترونات بين الأجسام."),
    candidate(2, 40, "تؤثر القوى في حركة الأجسام وتسارعها."),
  ]);
  assert.equal(result.references.length, 1);
  assert.equal(result.references[0].pageFrom, 15);
  assert.match(result.references[0].excerpt, /الشحنة الكهربائية/);
});

test("لا يعيد مقاطع بلا تطابق حقيقي", () => {
  const result = rankSourceChunks("الضغط", [candidate(0, 15, "الشحنة الكهربائية والمجال الكهربائي")]);
  assert.deepEqual(result.references, []);
});


test("يستبعد صفحة الفهرس حتى لو احتوت اسم الدرس حرفيًا", () => {
  const result = rankSourceChunks("9-1 النشاط الإشعاعي في كل مكان", [
    candidate(0, 12, "المحتويات\nالوحدة 9 النشاط الإشعاعي في كل مكان 12\nالوحدة 10 الفيزياء النووية 30\n1-1 الكهرباء الساكنة 40\n2-1 الضغط 80"),
    candidate(1, 45, "النشاط الإشعاعي هو الانبعاث التلقائي لإشعاع من نوى غير مستقرة. وتوجد أنواع مختلفة من الإشعاع."),
  ]);
  assert.equal(SOURCE_RETRIEVAL_VERSION, "strict-lesson-scope-1");
  assert.equal(result.references.length, 1);
  assert.equal(result.references[0].pageFrom, 45);
  assert.equal(isLikelyNavigationOrMetadataChunk("المحتويات الوحدة 1 12 الوحدة 2 30 الوحدة 3 50 الوحدة 4 70"), true);
  assert.equal(referenceSupportsLesson("النشاط الإشعاعي", "النشاط الإشعاعي انبعاث تلقائي من نواة غير مستقرة"), true);
});

test("لا يقبل مقطعًا يطابق كلمة عامة واحدة من اسم الدرس", () => {
  const result = rankSourceChunks("الطاقة الإشعاعية", [
    candidate(0, 20, "تتحول الطاقة الحركية إلى طاقة وضع في بعض الأنظمة."),
    candidate(1, 21, "تنتقل الطاقة الإشعاعية على هيئة موجات كهرومغناطيسية."),
  ]);
  assert.equal(result.references.length, 1);
  assert.equal(result.references[0].pageFrom, 21);
});


test("يربط درس النشاط الإشعاعي بمحتواه ويستبعد الضغط والدوائر والفهرس", () => {
  const source = { id: "science", authority: "منهج عُماني", kind: "كتاب الطالب" };
  const candidates = [
    { source, chunk: { chunkIndex: 0, pageFrom: 12, pageTo: 12, content: "المحتويات 1-1 الضغط 2-1 الدوائر الكهربائية 9-1 النشاط الإشعاعي في كل مكان 9-2 أنواع الإشعاع" } },
    { source, chunk: { chunkIndex: 1, pageFrom: 80, pageTo: 80, content: "الضغط هو القوة المؤثرة عموديًا على وحدة المساحة، وتوجد دوائر كهربائية بسيطة." } },
    { source, chunk: { chunkIndex: 2, pageFrom: 120, pageTo: 120, content: "9-1 النشاط الإشعاعي في كل مكان. النشاط الإشعاعي انبعاث تلقائي من نوى غير مستقرة، ويصاحبه انبعاث إشعاع." } },
  ];
  const result = rankSourceChunks("9-1 النشاط الإشعاعي في كل مكان", candidates, 2);
  assert.deepEqual(result.references.map((reference) => reference.pageFrom), [120]);
});
