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

test("يحفظ هوية مسارات كامبريدج الحالية من دون حقول مصادر", () => {
  const primary = normalizeExamDraft({ id: "p", programmeId: "primary", grade: 4, subjectId: "science", lessonTopics: ["النباتات"] });
  const lower = normalizeExamDraft({ id: "l", programmeId: "lower_secondary", grade: 8, subjectId: "science", lessonTopics: ["القوى"] });
  const igcse = normalizeExamDraft({ id: "i", programmeId: "igcse", grade: null, subjectId: "physics", lessonTopics: ["الموجات"] });
  assert.equal(primary?.syllabusCode, "0097");
  assert.equal(lower?.syllabusCode, "0893");
  assert.equal(igcse?.syllabusCode, "0625");
  assert.equal(primary && "sourceReferences" in primary, false);
});

test("يحفظ أكثر من مسودة بالمخطط الحالي فقط", () => {
  withMemoryStorage(() => {
    const first = normalizeExamDraft({ id: "draft-a", programmeId: "primary", grade: 5, subjectId: "science", updatedAt: "2026-08-11T08:00:00.000Z" });
    const second = normalizeExamDraft({ id: "draft-b", programmeId: "lower_secondary", grade: 8, subjectId: "science", updatedAt: "2026-08-11T09:00:00.000Z" });
    assert.ok(first && second);
    saveDraft(first); saveDraft(second);
    assert.deepEqual(loadDrafts().map((draft) => draft.id), ["draft-b", "draft-a"]);
    setActiveDraftId("draft-a");
    assert.equal(loadDraft()?.id, "draft-a");
    clearDraft("draft-a");
    assert.equal(loadDraft()?.id, "draft-b");
  });
});

test("لا يقرأ مفتاح مسودة تاريخي من مراحل ما قبل إعادة التأسيس", () => {
  withMemoryStorage((values) => {
    values.set("wathiq.phase0b.latestDraft", JSON.stringify({ id: "old" }));
    assert.equal(loadDraft(), null);
  });
});
