import test from "node:test";
import assert from "node:assert/strict";
import { resolveInitialView, viewFromHash, viewHash } from "../dist/assets/navigation.js";

test("يحوّل صفحات واثق إلى روابط hash ثابتة", () => {
  assert.equal(viewHash("home"), "#/home");
  assert.equal(viewHash("admin"), "#/content");
  assert.equal(viewHash("wizard"), "#/new-exam");
  assert.equal(viewHash("library"), "#/exams");
});

test("يعيد صفحة إدارة المحتوى بعد تحديث المتصفح", () => {
  assert.equal(viewFromHash("#/content"), "admin");
  assert.equal(resolveInitialView("#/content", null), "admin");
});

test("يستخدم آخر صفحة محفوظة عند غياب hash صالح", () => {
  assert.equal(resolveInitialView("", "admin"), "admin");
  assert.equal(resolveInitialView("#/unknown", "library"), "library");
  assert.equal(resolveInitialView("#/unknown", "invalid"), "home");
});
