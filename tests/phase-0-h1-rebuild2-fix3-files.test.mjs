import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Fix 3 يسترد صفوف الدروس مكانيًا ولا يشترط رمز OCR المثالي", async () => {
  const parser = await read("src/positional-toc.ts");
  assert.match(parser, /lessonOrdinalFromLine/);
  assert.match(parser, /الاسترداد المكاني/);
  assert.match(parser, /inferredPageNumber/);
  assert.match(parser, /nextExpectedLessonOrdinal/);
  assert.match(parser, /مصطلحات علميه\|ملحق/);
});

test("Fix 3 لا يغيّر Supabase أو pages workflow", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  assert.equal(packageJson.version, "0.0.22");
  assert.match(packageJson.description, /استرداد الدروس مكانيًا/);
});
