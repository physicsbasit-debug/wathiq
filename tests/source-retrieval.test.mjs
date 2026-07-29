import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeArabicSearchText,
  rankSourceChunks,
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
