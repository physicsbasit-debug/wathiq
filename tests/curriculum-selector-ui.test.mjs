import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CAMBRIDGE_LEVEL_OPTIONS,
  levelOptionForValue,
  levelSelectionValue,
  topicsForSelection,
} from "../dist/assets/cambridge-curriculum.js";

test("يعرض الصفوف 1-9 ثم الصف 10 IGCSE بوضوح", () => {
  assert.deepEqual(CAMBRIDGE_LEVEL_OPTIONS.slice(0, 9).map((item) => item.stage), [1,2,3,4,5,6,7,8,9]);
  assert.equal(CAMBRIDGE_LEVEL_OPTIONS.at(-1)?.id, "igcse:10");
  assert.equal(CAMBRIDGE_LEVEL_OPTIONS.at(-1)?.stage, 10);
  assert.equal(levelSelectionValue("lower_secondary", 8), "lower_secondary:8");
  assert.equal(levelSelectionValue("igcse", 10), "igcse:10");
  assert.equal(levelOptionForValue("primary:5")?.programmeId, "primary");
  assert.equal(levelOptionForValue("igcse:10")?.stage, 10);
});

test("لكل مرحلة من 1 إلى 9 قائمة موضوعات علوم وليست إدخالًا حرًا", () => {
  for (let stage = 1; stage <= 6; stage += 1) assert.ok(topicsForSelection("primary", "science", stage).length >= 10, `Stage ${stage}`);
  for (let stage = 7; stage <= 9; stage += 1) assert.ok(topicsForSelection("lower_secondary", "science", stage).length >= 15, `Stage ${stage}`);
});

test("تتضمن قائمة الصف 8 موضوعات القوى والحركة والضغط والضوء والمغناطيسية", () => {
  const labels = topicsForSelection("lower_secondary", "science", 8).map((item) => item.label).join(" | ");
  assert.match(labels, /السرعة والحركة/);
  assert.match(labels, /القوى المتزنة وغير المتزنة/);
  assert.match(labels, /عزم القوة/);
  assert.match(labels, /الضغط/);
  assert.match(labels, /انعكاس الضوء/);
  assert.match(labels, /المجالات المغناطيسية/);
});

test("فيزياء الصف 10 تعرض دروس الكتاب المحلي كاملة ضمن 19 وحدة", () => {
  const physics = topicsForSelection("igcse", "physics", 10);
  assert.equal(physics.length, 46);
  assert.equal(new Set(physics.map((item) => item.strand)).size, 19);
  assert.equal(physics[0]?.label, "الكهرباء الساكنة");
  assert.equal(physics.at(-1)?.label, "خطوط الطاقة الكهربائية والمحولات");
});

test("تبقى الكيمياء والأحياء والعلوم المجمعة والمنسقة ضمن قوائمها العلمية", () => {
  assert.equal(topicsForSelection("igcse", "chemistry", 10).length, 12);
  assert.equal(topicsForSelection("igcse", "biology", 10).length, 21);
  const combined = topicsForSelection("igcse", "combined_science", 10);
  const coordinated = topicsForSelection("igcse", "coordinated_sciences", 10);
  assert.equal(combined.filter((item) => item.strand === "الأحياء").length, 16);
  assert.equal(combined.filter((item) => item.strand === "الكيمياء").length, 12);
  assert.equal(combined.filter((item) => item.strand === "الفيزياء").length, 5);
  assert.equal(coordinated.filter((item) => item.strand === "الأحياء").length, 19);
  assert.equal(coordinated.filter((item) => item.strand === "الكيمياء").length, 12);
  assert.equal(coordinated.filter((item) => item.strand === "الفيزياء").length, 6);
});

test("واجهة المحتوى تستخدم قوائم الصف والمادة والموضوع ولا تعيد مربع النص القديم", async () => {
  const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
  assert.match(app, /id="level-select"/);
  assert.match(app, /id="subject-select"/);
  assert.match(app, /id="topic-select"/);
  assert.match(app, /الصف \/ المرحلة/);
  assert.match(app, /الموضوع \/ الدرس/);
  assert.doesNotMatch(app, /id="lesson-topics-input"/);
  assert.doesNotMatch(app, /id="programme-select"/);
});

test("واجهة الإعداد تعرض جدول المواصفات ولا تسمح بتعديل الدرجة وعدد المفردات يدويًا", async () => {
  const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
  assert.match(app, /جدول المواصفات/);
  assert.match(app, /المواصفة الرسمية المعتمدة/);
  assert.doesNotMatch(app, /data-count-key/);
  assert.doesNotMatch(app, /apply-suggestion/);
  assert.doesNotMatch(app, /countField\(/);
});
