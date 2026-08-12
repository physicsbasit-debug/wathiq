import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const version = "0.3.14";

test("البناء يمنع خلط وحدات JavaScript بين إصدارات GitHub Pages", async () => {
  const html = await readFile("dist/index.html", "utf8");
  assert.match(html, new RegExp(`assets/app\\.js\\?v=${version.replaceAll(".", "\\.")}`));
  assert.match(html, new RegExp(`assets/styles\\.css\\?v=${version.replaceAll(".", "\\.")}`));
  assert.match(html, new RegExp(`runtime-config\\.js\\?v=${version.replaceAll(".", "\\.")}`));
  const app = await readFile("dist/assets/app.js", "utf8");
  assert.match(app, new RegExp(`question-visual\\.js\\?v=${version.replaceAll(".", "\\.")}`));
  assert.match(app, new RegExp(`visual-jobs\\.js\\?v=${version.replaceAll(".", "\\.")}`));
});
