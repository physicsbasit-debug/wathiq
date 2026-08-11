import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSourceCatalogPath,
  changeSourceStatus,
  createEmptySourceDraft,
  createManagedSource,
  findDuplicateSource,
  validateSourceDraft,
} from "../dist/assets/source-domain.js";

function validFileDraft() {
  const draft = createEmptySourceDraft("file");
  draft.title = "كتاب الطالب للفيزياء";
  draft.kind = "كتاب الطالب";
  draft.grade = 10;
  draft.subjectId = "physics";
  draft.fileName = "physics.pdf";
  return draft;
}

test("يبني مسارًا منطقيًا داخل فهرس واثق دون اعتماد على خدمة تخزين خارجية", () => {
  const path = buildSourceCatalogPath(validFileDraft());
  assert.equal(path, "wathiq://الفيزياء/igcse/كتاب-الطالب");
  assert.doesNotMatch(path, /drive|google/iu);
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
  draft.url = "https://example.org/source";
  const validation = validateSourceDraft(draft);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.field === "rightsConfirmed"));
});

test("ينشئ مصدر PDF جاهزًا للفهرسة المباشرة داخل واثق", () => {
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

test("يمنح المصدر رقم فهرسة وجهة وبصمة", () => {
  const source = createManagedSource(validFileDraft(), new Date("2026-07-25T10:00:00Z"));
  assert.match(source.catalogCode, /^WTH-UP-IG-PHY-STU-/);
  assert.equal(source.authority, "مصدر مرفوع");
  assert.equal(source.fingerprint, "file|كتاب الطالب|10|physics|physics.pdf");
});

test("يكشف المصدر المكرر قبل الحفظ", () => {
  const existing = createManagedSource(validFileDraft(), new Date("2026-07-25T10:00:00Z"));
  const duplicate = findDuplicateSource([existing], validFileDraft());
  assert.equal(duplicate?.id, existing.id);
});

test("لا يحمل المصدر الاختياري حقول فصل دراسي أو إصدار محلي", () => {
  const source = createManagedSource(validFileDraft(), new Date("2026-07-25T10:00:00Z"));
  assert.equal("semester" in source, false);
  assert.equal("version" in source, false);
});
