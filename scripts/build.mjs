import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const buildVersion = String(packageJson.version || "dev").replace(/[^0-9A-Za-z._-]/g, "-");

await rm("dist", { recursive: true, force: true });
await mkdir("dist/assets", { recursive: true });

const result = spawnSync("tsc", ["-p", "tsconfig.json"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.status !== 0) process.exit(result.status ?? 1);

await cp("index.html", "dist/index.html");
await cp("src/styles.css", "dist/assets/styles.css");

const runtimeConfig = {
  supabaseUrl: process.env.WATHIQ_SUPABASE_URL ?? "",
  supabasePublishableKey: process.env.WATHIQ_SUPABASE_PUBLISHABLE_KEY ?? "",
};
await writeFile(
  "dist/runtime-config.js",
  `window.__WATHIQ_CONFIG__ = ${JSON.stringify(runtimeConfig)};\n`,
  "utf8",
);

// GitHub Pages/CDN may retain unchanged ES modules between releases. Every emitted
// relative JS import receives the application version so one page load can never
// mix an old question-visual module with a new worker contract.
async function versionRelativeModuleImports(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await versionRelativeModuleImports(filePath);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
    let source = await readFile(filePath, "utf8");
    source = source
      .replace(/(\bfrom\s+["'])(\.\.?\/[^"']+\.js)(["'])/g, `$1$2?v=${buildVersion}$3`)
      .replace(/(\bimport\s*\(\s*["'])(\.\.?\/[^"']+\.js)(["']\s*\))/g, `$1$2?v=${buildVersion}$3`);
    await writeFile(filePath, source, "utf8");
  }
}
await versionRelativeModuleImports("dist/assets");

let html = await readFile("dist/index.html", "utf8");
html = html
  .replace("./runtime-config.js", `./runtime-config.js?v=${buildVersion}`)
  .replace("./assets/app.js", `./assets/app.js?v=${buildVersion}`)
  .replace("</head>", `    <link rel="stylesheet" href="./assets/styles.css?v=${buildVersion}" />\n  </head>`);
await writeFile("dist/index.html", html, "utf8");

console.log(`PASS: TypeScript compiled, cache-busted module graph v${buildVersion}, and static assets copied to dist/`);
