import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const port = Number(process.env.PORT ?? 4173);
const root = new URL("../dist/", import.meta.url).pathname;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

createServer(async (request, response) => {
  try {
    const requestPath = decodeURIComponent((request.url ?? "/").split("?")[0] ?? "/");
    const safePath = normalize(requestPath).replace(/^([.][.][/\\])+/, "");
    let filePath = join(root, safePath === "/" ? "index.html" : safePath);
    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat || fileStat.isDirectory()) filePath = join(root, "index.html");
    const data = await readFile(filePath);
    response.writeHead(200, { "Content-Type": mime[extname(filePath)] ?? "application/octet-stream" });
    response.end(data);
  } catch {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("تعذر تشغيل النموذج المحلي.");
  }
}).listen(port, () => {
  console.log(`واثق يعمل على http://localhost:${port}`);
});
