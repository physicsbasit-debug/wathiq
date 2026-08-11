import test from "node:test";
import assert from "node:assert/strict";
import {
  createRegistryBackup,
  mergeSourceRegistry,
  normalizeManagedSource,
  parseRegistryBackup,
} from "../dist/assets/source-registry.js";
import { createEmptySourceDraft, createManagedSource } from "../dist/assets/source-domain.js";

function sourceAt(title, fileName, time) {
  const draft = createEmptySourceDraft("file");
  draft.title = title;
  draft.kind = "كتاب الطالب";
  draft.grade = 10;
  draft.subjectId = "physics";
  draft.version = "2026";
  draft.fileName = fileName;
  return createManagedSource(draft, new Date(time));
}

test("ينشئ نسخة احتياطية بمعيار واثق الإصدار 1", () => {
  const source = sourceAt("كتاب الفيزياء", "physics.pdf", "2026-07-25T10:00:00Z");
  const backup = createRegistryBackup([source], new Date("2026-07-25T12:00:00Z"));
  assert.equal(backup.schemaVersion, 1);
  assert.equal(backup.product, "واثق");
  assert.equal(backup.sources.length, 1);
});

test("يقرأ نسخة احتياطية صحيحة", () => {
  const source = sourceAt("كتاب الفيزياء", "physics.pdf", "2026-07-25T10:00:00Z");
  const raw = JSON.stringify(createRegistryBackup([source], new Date("2026-07-25T12:00:00Z")));
  const parsed = parseRegistryBackup(raw);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.sources[0].catalogCode, source.catalogCode);
});

test("يرفض JSON غير صالح", () => {
  const parsed = parseRegistryBackup("{not-valid");
  assert.equal(parsed.valid, false);
  assert.match(parsed.issues[0], /JSON/);
});

test("يرفض ملفًا ليس نسخة واثق", () => {
  const parsed = parseRegistryBackup(JSON.stringify({ schemaVersion: 2, product: "غير واثق", sources: [] }));
  assert.equal(parsed.valid, false);
});

test("يدمج السجل ويتجاوز المصدر المكرر", () => {
  const existing = sourceAt("كتاب الفيزياء", "physics.pdf", "2026-07-25T10:00:00Z");
  const newSource = sourceAt("دليل إضافي", "extra.pdf", "2026-07-25T11:00:00Z");
  const merged = mergeSourceRegistry([existing], [existing, newSource]);
  assert.equal(merged.addedCount, 1);
  assert.equal(merged.skippedCount, 1);
  assert.equal(merged.sources.length, 2);
});

test("يرقّي سجلًا قديمًا بإضافة رقم وفهرسة داخلية", () => {
  const legacy = sourceAt("كتاب الفيزياء", "physics.pdf", "2026-07-25T10:00:00Z");
  delete legacy.catalogCode;
  delete legacy.fingerprint;
  delete legacy.authority;
  const normalized = normalizeManagedSource(legacy);
  assert.ok(normalized);
  assert.match(normalized.catalogCode, /^WTH-LEGACY-/);
  assert.equal(normalized.authority, "مصدر مرفوع");
  assert.ok(normalized.fingerprint);
});
