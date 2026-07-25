import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSourceDrivePath,
  changeSourceStatus,
  createEmptySourceDraft,
  createManagedSource,
  validateSourceDraft,
} from "../dist/assets/source-domain.js";

function validFileDraft() {
  const draft = createEmptySourceDraft("file");
  draft.title = "كتاب الطالب للفيزياء";
  draft.kind = "كتاب الطالب";
  draft.grade = 10;
  draft.subjectId = "physics";
  draft.version = "2026";
  draft.fileName = "physics.pdf";
  return draft;
}

test("يبني مسار Drive للمصدر العماني بحسب الصف والمادة والنوع", () => {
  const path = buildSourceDrivePath(validFileDraft());
  assert.equal(path, "واثق/01_مصادر_المنصة/المنهج_العماني/الصف_10/الفيزياء/كتاب_الطالب/");
});

test("يضع اختبار كامبريدج في مساره المستقل", () => {
  const draft = validFileDraft();
  draft.kind = "اختبار كامبريدج";
  assert.equal(
    buildSourceDrivePath(draft),
    "واثق/01_مصادر_المنصة/اختبارات_كامبريدج/الفيزياء/غير_مصنف/أوراق_الأسئلة/",
  );
});


test("يرفض ملفًا ليس PDF", () => {
  const draft = validFileDraft();
  draft.fileName = "physics.docx";
  const validation = validateSourceDraft(draft);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.field === "fileName"));
});

test("يرفض رابطًا بلا حقوق استخدام مؤكدة", () => {
  const draft = createEmptySourceDraft("url");
  draft.title = "مصدر عالمي";
  draft.grade = 8;
  draft.subjectId = "science";
  draft.version = "صفحة حية";
  draft.url = "https://example.org/source";
  const validation = validateSourceDraft(draft);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.field === "rightsConfirmed"));
});

test("ينشئ مصدرًا صالحًا بحالة جاهز للفهرسة", () => {
  const source = createManagedSource(validFileDraft(), new Date("2026-07-25T10:00:00Z"));
  assert.equal(source.status, "جاهز للفهرسة");
  assert.equal(source.fileName, "physics.pdf");
  assert.equal(source.updatedAt, "2026-07-25T10:00:00.000Z");
});

test("يؤرشف المصدر دون حذفه", () => {
  const source = createManagedSource(validFileDraft(), new Date("2026-07-25T10:00:00Z"));
  const updated = changeSourceStatus([source], source.id, "مؤرشف", new Date("2026-07-25T11:00:00Z"));
  assert.equal(updated.length, 1);
  assert.equal(updated[0].status, "مؤرشف");
});
