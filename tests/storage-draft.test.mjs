import test from "node:test";
import assert from "node:assert/strict";
import { clearDraft, loadDraft, loadDrafts, normalizeExamDraft, saveDraft, setActiveDraftId } from "../dist/assets/storage.js";

function withMemoryStorage(run) {
  const original = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); },
  };
  try { return run(values); } finally { globalThis.localStorage = original; }
}

test("يرحّل مسودة صفوف 1-6 إلى Cambridge Primary", () => {
  const draft = normalizeExamDraft({ id: "legacy-primary", grade: 4, subjectId: "science", topic: "Plants" });
  assert.ok(draft);
  assert.equal(draft.programmeId, "primary");
  assert.equal(draft.syllabusCode, "0097");
  assert.equal(draft.generationMode, "progressive_items_v1");
});

test("يرحّل الصفوف 7-9 علوم إلى Cambridge Lower Secondary", () => {
  const draft = normalizeExamDraft({ id: "legacy-lower", grade: 8, subjectId: "science", topic: "Forces" });
  assert.ok(draft);
  assert.equal(draft.programmeId, "lower_secondary");
  assert.equal(draft.syllabusCode, "0893");
});

test("يرحّل الفيزياء العليا إلى IGCSE Physics 0625", () => {
  const draft = normalizeExamDraft({ id: "legacy-igcse", grade: 10, subjectId: "physics", topic: "Waves" });
  assert.ok(draft);
  assert.equal(draft.programmeId, "igcse");
  assert.equal(draft.syllabusCode, "0625");
});

test("المسودة الجديدة لا تحتاج sourceReferences", () => {
  const draft = normalizeExamDraft({ id: "global", grade: 8, subjectId: "science", lessonTopics: ["Energy"], sourceReferences: [] });
  assert.ok(draft);
  assert.deepEqual(draft.sourceReferences, []);
});

test("يحفظ أكثر من مسودة دون استبدال العمل السابق", () => {
  withMemoryStorage(() => {
    const first = normalizeExamDraft({ id: "draft-a", updatedAt: "2026-08-01T10:00:00.000Z" });
    const second = normalizeExamDraft({ id: "draft-b", updatedAt: "2026-08-01T11:00:00.000Z" });
    assert.ok(first && second);
    saveDraft(first); saveDraft(second);
    assert.deepEqual(loadDrafts().map((draft) => draft.id), ["draft-b", "draft-a"]);
    assert.equal(loadDraft()?.id, "draft-b");
    setActiveDraftId("draft-a");
    assert.equal(loadDraft()?.id, "draft-a");
    clearDraft("draft-a");
    assert.equal(loadDraft()?.id, "draft-b");
  });
});

test("يرحّل مفتاح المسودة المحلية القديمة تلقائيًا", () => {
  withMemoryStorage((values) => {
    values.set("wathiq.phase0b.latestDraft", JSON.stringify({ id: "legacy-draft", grade: 5, subjectId: "science", updatedAt: "2026-08-01T09:00:00.000Z" }));
    const loaded = loadDraft();
    assert.equal(loaded?.id, "legacy-draft");
    assert.equal(loaded?.programmeId, "primary");
  });
});
