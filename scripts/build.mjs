import { cp, mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import process from "node:process";

await rm("dist", { recursive: true, force: true });
await mkdir("dist/assets", { recursive: true });

const result = spawnSync("tsc", ["-p", "tsconfig.json"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.status !== 0) process.exit(result.status ?? 1);

await cp("index.html", "dist/index.html");
await cp("src/styles.css", "dist/assets/styles.css");

let html = await (await import("node:fs/promises")).readFile("dist/index.html", "utf8");
html = html.replace("</head>", '    <link rel="stylesheet" href="./assets/styles.css" />\n  </head>');
await (await import("node:fs/promises")).writeFile("dist/index.html", html, "utf8");

console.log("PASS: TypeScript compiled and static assets copied to dist/");
