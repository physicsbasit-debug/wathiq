import assert from "node:assert/strict";

/**
 * يتحقق من بقاء نسخة واثق ضمن سلسلة 0.0.x ومن عدم رجوعها إلى ما قبل المرحلة التاريخية.
 * استخدام حد أدنى يمنع تعديل عشرات الاختبارات عند كل إصدار لاحق.
 */
export function assertWathiqPatchAtLeast(version, minimumPatch) {
  const match = /^0\.0\.(\d+)$/.exec(String(version));
  assert.ok(match, `إصدار واثق غير صالح: ${String(version)}`);
  const patch = Number(match[1]);
  assert.ok(Number.isSafeInteger(patch) && patch >= minimumPatch,
    `إصدار واثق ${String(version)} أقدم من الحد الأدنى 0.0.${minimumPatch}.`);
}
