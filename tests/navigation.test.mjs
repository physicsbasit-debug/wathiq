import test from "node:test";
import assert from "node:assert/strict";
import { resolveInitialView, viewFromHash, viewHash } from "../dist/assets/navigation.js";

test("يحصر التنقل في الرئيسية وإنشاء الاختبار والمكتبة", () => {
  assert.equal(viewHash("home"), "#/home");
  assert.equal(viewHash("wizard"), "#/new-exam");
  assert.equal(viewHash("library"), "#/exams");
  assert.equal(viewFromHash("#/content"), null);
  assert.equal(viewFromHash("#/admin"), null);
});

test("يتجاهل الروابط القديمة ويرجع إلى الصفحة الحالية أو الرئيسية", () => {
  assert.equal(resolveInitialView("#/content", null), "home");
  assert.equal(resolveInitialView("#/unknown", "library"), "library");
  assert.equal(resolveInitialView("#/unknown", "invalid"), "home");
});
