import { readdir, rm, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const CLEAN_MODE = process.argv.includes("--clean");

const allowedRootFiles = new Set([
  ".gitignore",
  "README.md",
  "index.html",
  "package.json",
  "tsconfig.json",
]);

const allowedRootDirs = new Set([
  ".git",
  ".github",
  "docs",
  "node_modules",
  "scripts",
  "src",
  "supabase",
  "tests",
]);


const allowedDocsFiles = new Set([
  "ARCHITECTURE.md",
  "DEPLOYMENT.md",
  "HISTORY.md",
  "OPERATIONS.md",
  "QUALITY_ACCEPTANCE.md",
  "REPOSITORY_MAINTENANCE.md",
]);

const forbiddenRootPatterns = [
  /^PHASE_/i,
  /^CHANGED_FILES_MANIFEST/i,
  /^GITHUB_UPLOAD_INSTRUCTIONS/i,
  /^HIDDEN_FILES_RESTORE_INSTRUCTIONS/i,
  /^GITHUB_WORKFLOW_VISIBLE$/i,
  /^WATHIQ_(?:RESET|APPLY)_/i,
  /~\d*\./,
  /\.(bak|tmp|zip)$/i,
];

const removed = [];

const obsoleteRuntimePaths = [
  "scripts/check-phase-3-0-readiness.mjs",
  "src/google-drive.ts",
  "src/question-generation.ts",
  "src/assessment-generation-v2.ts",
  "src/positional-toc.ts",
  "src/toc-draft-builder.ts",
  "src/toc-layout-ocr.ts",
  "src/scientific-item.ts",
  "src/assessment-engine/scientific-contracts.ts",
  "src/assessment-engine/item-validation.ts",
  "src/source-structure.ts",
  "src/book-content-tree.ts",
  "src/central-source-store.ts",
  "src/lesson-catalog.ts",
  "src/ocr-indexer.ts",
  "src/pdf-indexer.ts",
  "src/source-domain.ts",
  "src/source-registry.ts",
  "src/source-retrieval.ts",
  "src/assessment-engine/source-grounding.ts",
  "src/assessment-engine/normalization.ts",
  "supabase/functions/google-drive-oauth",
  "supabase/functions/generate-source-questions",
  "supabase/functions/source-ocr",
];

const obsoleteTestNames = new Set([
  "assessment-generation-v2.test.mjs",
  "gemini-generate-content-edge.test.mjs",
  "google-drive.test.mjs",
  "positional-toc.test.mjs",
  "question-generation.test.mjs",
  "toc-draft-builder.test.mjs",
  "toc-layout-ocr-cache.test.mjs",
  "version-assertions.mjs",
  "source-structure.test.mjs",
  "central-source-store.test.mjs",
  "lesson-catalog.test.mjs",
  "ocr-indexer.test.mjs",
  "pdf-indexer.test.mjs",
  "source-domain.test.mjs",
  "source-registry.test.mjs",
  "source-retrieval.test.mjs",
]);

async function removeKnownObsoleteArtifacts() {
  const entries = await readdir(".");
  for (const name of entries) {
    if (name === "dist") {
      await rm(name, { recursive: true, force: true });
      removed.push(`${name}/`);
      continue;
    }

    if (forbiddenRootPatterns.some((pattern) => pattern.test(name))) {
      await rm(name, { recursive: true, force: true });
      removed.push(name);
    }
  }

  try {
    const docs = await readdir("docs");
    for (const name of docs) {
      if (!allowedDocsFiles.has(name)) {
        await rm(`docs/${name}`, { recursive: true, force: true });
        removed.push(`docs/${name}`);
      }
    }
  } catch {
    // The validation pass below will report a missing docs directory if relevant.
  }

  for (const path of obsoleteRuntimePaths) {
    try {
      await stat(path);
      await rm(path, { recursive: true, force: true });
      removed.push(path);
    } catch {
      // Already absent.
    }
  }

  try {
    for (const name of await readdir("tests")) {
      if (/^phase-/i.test(name) || obsoleteTestNames.has(name)) {
        await rm(`tests/${name}`, { force: true });
        removed.push(`tests/${name}`);
      }
    }
  } catch {
    // Validation and npm tests will expose a damaged tests directory.
  }

  try {
    for (const name of await readdir("supabase")) {
      if (/^phase_.*\.sql$/i.test(name)) {
        await rm(`supabase/${name}`, { force: true });
        removed.push(`supabase/${name}`);
      }
    }
  } catch {
    // Validation below will catch unexpected Supabase artifacts.
  }
}

if (CLEAN_MODE) {
  await removeKnownObsoleteArtifacts();
  if (removed.length) {
    console.log("CLEAN: removed known obsolete repository artifacts");
    for (const name of removed) console.log(`- ${name}`);
  } else {
    console.log("CLEAN: repository already contains no known obsolete artifacts");
  }
}

const failures = [];
const entries = await readdir(".");
for (const name of entries) {
  const info = await stat(name);
  if (forbiddenRootPatterns.some((pattern) => pattern.test(name))) {
    failures.push(`forbidden root artifact: ${name}`);
    continue;
  }
  if (info.isFile() && !allowedRootFiles.has(name)) failures.push(`unexpected root file: ${name}`);
  if (info.isDirectory() && !allowedRootDirs.has(name) && name !== "dist") failures.push(`unexpected root directory: ${name}`);
}

const docs = await readdir("docs");
for (const name of docs) {
  if (!allowedDocsFiles.has(name)) failures.push(`unexpected documentation artifact: docs/${name}`);
}

for (const path of obsoleteRuntimePaths) {
  try {
    await stat(path);
    failures.push(`obsolete runtime artifact: ${path}`);
  } catch {
    // Expected.
  }
}

for (const name of await readdir("tests")) {
  if (/^phase-/i.test(name) || obsoleteTestNames.has(name)) failures.push(`obsolete test artifact: tests/${name}`);
}

const supabaseEntries = await readdir("supabase");
for (const name of supabaseEntries) {
  if (/^phase_.*\.sql$/i.test(name)) failures.push(`obsolete SQL migration artifact: supabase/${name}`);
}
if (!supabaseEntries.includes("schema-current.sql")) failures.push("missing current Supabase schema: supabase/schema-current.sql");

const gitCheck = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
if (gitCheck.status === 0 && gitCheck.stdout.trim() === "true") {
  const trackedDist = spawnSync("git", ["ls-files", "dist"], { encoding: "utf8" });
  if (trackedDist.status === 0 && trackedDist.stdout.trim()) {
    const trackedDistFiles = trackedDist.stdout
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);

    const trackedDistStillPresent = [];
    for (const file of trackedDistFiles) {
      try {
        await stat(file);
        trackedDistStillPresent.push(file);
      } catch {
        // A tracked build artifact deleted by --clean is intentionally pending removal
        // until the maintenance workflow commits the cleanup.
      }
    }

    if (trackedDistStillPresent.length) {
      failures.push("dist/ is tracked by git; generated build output must not be committed");
    }
  }
}

if (failures.length) {
  console.error("FAIL: repository hygiene");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PASS: repository hygiene");
