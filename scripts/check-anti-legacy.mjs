import { readFile, readdir, access } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;
const SCAN_ROOTS = ["src", "supabase/functions"];
const SINGLE_FILES = [
  "supabase/schema-current.sql",
  "supabase/config.toml",
  ".github/workflows/ci.yml",
  ".github/workflows/pages.yml",
  ".github/workflows/repository-maintenance.yml",
];

// هذه الأنماط لا مكان لها في مسار التشغيل الحالي. وجودها يعني أن طبقة قديمة عادت.
const FORBIDDEN = [
  /phase0/iu,
  /google[-_ ]?drive/iu,
  /google[-_ ]?oauth/iu,
  /WATHIQ_GOOGLE_OAUTH_CLIENT_ID/u,
  /source-ocr/iu,
  /source_registry/iu,
  /source_chunks/iu,
  /source_ocr_pages/iu,
  /source_upload/iu,
  /uploaded_source/iu,
  /drive_path/iu,
  /rights_confirmed/iu,
  /WTH-LEGACY/iu,
  /generate-source-questions/iu,
  /source-structure/iu,
  /book-content-tree/iu,
  /positional-toc/iu,
  /scientific-item/iu,
  /QuestionVisualVariant/u,
  /QuestionVisualRole/u,
  /styleTarget/u,
  /scenarioTarget/u,
  /visualTarget/u,
  /numericSeed/u,
  /scientificContractKey/u,
  /line[-_ ]?art/iu,
  /question-visual-overlay/iu,
  /scene_2d_overlay/iu,
  /\boverlay\b/iu,
  /إدارة المحتوى/u,
  /مصادر اختيارية/u,
  /رفع PDF/iu,
  /منهج عُماني/u,
];

const FORBIDDEN_PATHS = [
  "src/google-drive.ts",
  "src/question-generation.ts",
  "src/assessment-generation-v2.ts",
  "src/scientific-item.ts",
  "src/source-structure.ts",
  "src/book-content-tree.ts",
  "src/positional-toc.ts",
  "src/central-source-store.ts",
  "src/lesson-catalog.ts",
  "src/ocr-indexer.ts",
  "src/pdf-indexer.ts",
  "src/source-domain.ts",
  "src/source-registry.ts",
  "src/source-retrieval.ts",
  "supabase/functions/google-drive-oauth/index.ts",
  "supabase/functions/generate-source-questions/index.ts",
  "supabase/functions/source-ocr/index.ts",
];

async function walk(dir) {
  const result = [];
  for (const entry of await readdir(join(ROOT, dir), { withFileTypes: true })) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(rel));
    else if (/\.(?:ts|js|mjs|sql|toml)$/iu.test(entry.name)) result.push(rel);
  }
  return result;
}

const failures = [];
for (const path of FORBIDDEN_PATHS) {
  try {
    await access(join(ROOT, path));
    failures.push(`ملف قديم ممنوع: ${path}`);
  } catch {
    // المطلوب أن يكون محذوفًا.
  }
}

const files = [...new Set([...(await Promise.all(SCAN_ROOTS.map(walk))).flat(), ...SINGLE_FILES])];
for (const file of files) {
  const text = await readFile(join(ROOT, file), "utf8");
  for (const pattern of FORBIDDEN) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) failures.push(`أثر قديم ممنوع في ${file}: ${pattern}`);
  }
}

if (failures.length) {
  console.error("FAIL: anti-legacy gate");
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}

console.log(`PASS: anti-legacy gate | ${files.length} runtime files checked`);
