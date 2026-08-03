import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const text = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const edge = await text("supabase/functions/generate-source-questions/index.ts");

test("يرسل إعدادات أبعاد الصورة عبر imageConfig النصي المدعوم", () => {
  assert.match(edge, /generationConfig:\s*\{[\s\S]*responseModalities:\s*\["IMAGE"\][\s\S]*imageConfig:\s*\{\s*aspectRatio:\s*"4:3",\s*imageSize:\s*"1K"\s*\}/);
  assert.doesNotMatch(edge, /responseFormat:\s*\{\s*image:\s*\{\s*aspectRatio:\s*"4:3"/);
});
