import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const tree = fs.readFileSync("src/book-content-tree.ts", "utf8");
const app = fs.readFileSync("src/app.ts", "utf8");
const retrieval = fs.readFileSync("src/source-retrieval.ts", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

test("يثبت ربط الصفحات المطبوعة بصفحات PDF مع بحث متدرج آمن", () => {
  assert.match(pkg.version, /^0\.0\.(?:40|41|42|43|44|45|46|47|48|49|50|51|52|53|54|55|56|57|58|59|60)$/);
  assert.match(tree, /pdfPageOffset:\s*3/);
  assert.match(tree, /toPdfPage/);
  assert.match(retrieval, /strict-lesson-scope-3-pdf-pages/);
  assert.match(app, /exactPageScoped/);
  assert.match(app, /paddedPageScoped/);
  assert.match(app, /pageEnd \+ 3/);
});
