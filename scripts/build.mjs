import { cp, mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import process from "node:process";

await rm("dist", { recursive: true, force: true });
await mkdir("dist/assets", { recursive: true });
await mkdir("dist/references", { recursive: true });

const result = spawnSync("tsc", ["-p", "tsconfig.json"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.status !== 0) process.exit(result.status ?? 1);

await cp("index.html", "dist/index.html");
await cp("src/styles.css", "dist/assets/styles.css");
await cp("references", "dist/references", { recursive: true });

const runtimeConfig = {
  supabaseUrl: process.env.WATHIQ_SUPABASE_URL ?? "",
  supabasePublishableKey: process.env.WATHIQ_SUPABASE_PUBLISHABLE_KEY ?? "",
  googleOAuthClientId: process.env.WATHIQ_GOOGLE_OAUTH_CLIENT_ID ?? "",
};
await (await import("node:fs/promises")).writeFile(
  "dist/runtime-config.js",
  `window.__WATHIQ_CONFIG__ = ${JSON.stringify(runtimeConfig)};\n`,
  "utf8",
);

let html = await (await import("node:fs/promises")).readFile("dist/index.html", "utf8");
html = html.replace("</head>", '    <link rel="stylesheet" href="./assets/styles.css" />\n  </head>');
await (await import("node:fs/promises")).writeFile("dist/index.html", html, "utf8");

console.log("PASS: TypeScript compiled and static assets copied to dist/");
