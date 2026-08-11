import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CAMBRIDGE_LEVEL_OPTIONS,
  levelOptionForValue,
  levelSelectionValue,
  topicsForSelection,
} from "../dist/assets/cambridge-curriculum.js";

test("يعرض اختيار الصفوف 1-9 ثم IGCSE بوضوح", () => {
  assert.deepEqual(CAMBRIDGE_LEVEL_OPTIONS.slice(0, 9).map((item) => item.stage), [1,2,3,4,5,6,7,8,9]);
  assert.equal(CAMBRIDGE_LEVEL_OPTIONS.at(-1)?.id, "igcse");
  assert.equal(levelSelectionValue("lower_secondary", 8), "lower_secondary:8");
  assert.equal(levelOptionForValue("primary:5")?.programmeId, "primary");
  assert.equal(levelOptionForValue("igcse")?.stage, null);
});

test("لكل مرحلة من 1 إلى 9 قائمة موضوعات علوم وليست إدخالًا حرًا", () => {
  for (let stage = 1; stage <= 6; stage += 1) {
    assert.ok(topicsForSelection("primary", "science", stage).length >= 10, `Stage ${stage}`);
  }
  for (let stage = 7; stage <= 9; stage += 1) {
    assert.ok(topicsForSelection("lower_secondary", "science", stage).length >= 15, `Stage ${stage}`);
  }
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

test("تعرض IGCSE القوائم العليا المعتمدة للفيزياء والكيمياء والأحياء", () => {
  assert.equal(topicsForSelection("igcse", "physics", null).length, 6);
  assert.equal(topicsForSelection("igcse", "chemistry", null).length, 12);
  assert.equal(topicsForSelection("igcse", "biology", null).length, 21);
  assert.match(topicsForSelection("igcse", "physics", null).map((item) => item.label).join(" | "), /فيزياء الفضاء/);
  assert.match(topicsForSelection("igcse", "chemistry", null).map((item) => item.label).join(" | "), /التقنيات التجريبية والتحليل الكيميائي/);
  assert.match(topicsForSelection("igcse", "biology", null).map((item) => item.label).join(" | "), /التقنية الحيوية والتعديل الوراثي/);
});

test("يحترم اختلاف محتوى العلوم المجمعة والمنسقة في IGCSE", () => {
  const combined = topicsForSelection("igcse", "combined_science", null);
  const coordinated = topicsForSelection("igcse", "coordinated_sciences", null);
  assert.equal(combined.filter((item) => item.strand === "الأحياء").length, 16);
  assert.equal(combined.filter((item) => item.strand === "الكيمياء").length, 12);
  assert.equal(combined.filter((item) => item.strand === "الفيزياء").length, 5);
  assert.equal(coordinated.filter((item) => item.strand === "الأحياء").length, 19);
  assert.equal(coordinated.filter((item) => item.strand === "الكيمياء").length, 12);
  assert.equal(coordinated.filter((item) => item.strand === "الفيزياء").length, 6);
  assert.ok(!combined.some((item) => item.label === "الفيزياء النووية"));
  assert.ok(coordinated.some((item) => item.label === "الفيزياء النووية"));
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
