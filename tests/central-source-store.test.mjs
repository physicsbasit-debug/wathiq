import test from "node:test";
import assert from "node:assert/strict";
import { CentralSourceStore, rowToSource, sourceToRow } from "../dist/assets/central-source-store.js";

const memory = new Map();
globalThis.localStorage = {
  getItem(key) { return memory.has(key) ? memory.get(key) : null; },
  setItem(key, value) { memory.set(key, String(value)); },
  removeItem(key) { memory.delete(key); },
  clear() { memory.clear(); },
};

const source = {
  id: "source-1",
  catalogCode: "WTH-OM-G10-PHY-STU-2026-ABC123",
  fingerprint: "file|كتاب الطالب|10|physics|الفصل الأول|2026|physics.pdf",
  authority: "منهج عُماني",
  title: "كتاب الطالب للفيزياء",
  kind: "كتاب الطالب",
  mode: "file",
  grade: 10,
  subjectId: "physics",
  version: "2026",
  semester: "الفصل الأول",
  fileName: "physics.pdf",
  rightsConfirmed: true,
  status: "جاهز للفهرسة",
  drivePath: "واثق/01_مصادر_المنصة/01_المنهج_العماني/الصف_10/الفيزياء/الفصل_الأول/كتاب_الطالب/",
  contentFingerprint: "sha256-sample:abcdef",
  fileSizeBytes: 2048,
  mimeType: "application/pdf",
  driveFileId: "drive-file-1",
  driveParentFolderId: "folder-1",
  driveOriginalParentFolderId: "folder-1",
  driveWebViewLink: "https://drive.google.com/file/d/drive-file-1/view",
  driveMd5Checksum: "abc123",
  uploadState: "مرفوع",
  uploadedAt: "2026-07-25T10:05:00.000Z",
  createdAt: "2026-07-25T10:00:00.000Z",
  updatedAt: "2026-07-25T10:00:00.000Z",
};

test("يحوّل سجل واثق إلى صف Supabase ويعيده دون فقد", () => {
  const row = sourceToRow(source, "11111111-1111-1111-1111-111111111111");
  assert.equal(row.owner_id, "11111111-1111-1111-1111-111111111111");
  assert.equal(row.catalog_code, source.catalogCode);
  assert.equal(row.extraction_status, "لم يبدأ");
  assert.equal(row.semester, "الفصل الأول");
  assert.deepEqual(rowToSource(row), { ...source, extractionStatus: "لم يبدأ" });
});


test("لا يرسل extraction_status فارغًا للمصادر القديمة بعد ترقية Phase 0-G", () => {
  const legacySource = { ...source };
  delete legacySource.extractionStatus;
  const row = sourceToRow(legacySource, "11111111-1111-1111-1111-111111111111");
  assert.equal(row.extraction_status, "لم يبدأ");
  assert.equal(row.semester, "الفصل الأول");
  assert.notEqual(row.extraction_status, null);
});

test("يسجل دخول المالك ويحفظ ويقرأ ويحدّث المصدر عبر Data API", async () => {
  memory.clear();
  const calls = [];
  const ownerId = "11111111-1111-1111-1111-111111111111";
  const row = sourceToRow(source, ownerId);

  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/auth/v1/token?grant_type=password")) {
      return Response.json({
        access_token: "user-jwt",
        refresh_token: "refresh-jwt",
        expires_in: 3600,
        user: { id: ownerId, email: "owner@example.com" },
      });
    }
    if (init.method === "POST" && String(url).includes("/rest/v1/source_registry")) {
      return Response.json([row]);
    }
    if (init.method === "GET" && String(url).includes("/rest/v1/source_registry")) {
      return Response.json([row]);
    }
    if (init.method === "PATCH") {
      return new Response(null, { status: 204 });
    }
    throw new Error(`طلب غير متوقع: ${url}`);
  };

  const store = new CentralSourceStore({
    supabaseUrl: "https://project.supabase.co",
    supabasePublishableKey: "sb_publishable_test",
  }, fetcher);

  const session = await store.signIn("owner@example.com", "secret");
  assert.equal(session.userId, ownerId);
  assert.equal(store.restoreSession()?.email, "owner@example.com");

  const saved = await store.upsertSources([source]);
  const expectedSource = { ...source, extractionStatus: "لم يبدأ" };
  assert.deepEqual(saved, [expectedSource]);
  assert.deepEqual(await store.listSources(), [expectedSource]);
  await store.updateStatus(source.id, "مفهرس", "2026-07-25T11:00:00.000Z");

  const dataCalls = calls.filter((call) => call.url.includes("/rest/v1/"));
  assert.equal(dataCalls.length, 3);
  for (const call of dataCalls) {
    assert.equal(call.init.headers.Authorization, "Bearer user-jwt");
    assert.equal(call.init.headers.apikey, "sb_publishable_test");
  }
});

test("يرفض صفًا مركزيًا ناقصًا بدل إدخاله إلى سجل واثق", () => {
  assert.equal(rowToSource({ id: "broken" }), null);
});


test("يستدعي fetch الافتراضي بسياق globalThis دون Illegal invocation", async () => {
  memory.clear();
  const originalFetch = globalThis.fetch;
  const ownerId = "11111111-1111-1111-1111-111111111111";

  globalThis.fetch = async function (url) {
    assert.equal(this, globalThis);
    assert.match(String(url), /\/auth\/v1\/token\?grant_type=password$/);
    return Response.json({
      access_token: "user-jwt",
      refresh_token: "refresh-jwt",
      expires_in: 3600,
      user: { id: ownerId, email: "owner@example.com" },
    });
  };

  try {
    const store = new CentralSourceStore({
      supabaseUrl: "https://project.supabase.co",
      supabasePublishableKey: "sb_publishable_test",
    });
    const session = await store.signIn("owner@example.com", "secret");
    assert.equal(session.userId, ownerId);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("يحفظ مقاطع الاستخراج ثم يحدّث ملخص المصدر", async () => {
  memory.clear();
  const ownerId = "11111111-1111-1111-1111-111111111111";
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/auth/v1/token?grant_type=password")) {
      return Response.json({
        access_token: "user-jwt",
        refresh_token: "refresh-jwt",
        expires_in: 3600,
        user: { id: ownerId, email: "owner@example.com" },
      });
    }
    return new Response(null, { status: 204 });
  };
  const store = new CentralSourceStore({
    supabaseUrl: "https://project.supabase.co",
    supabasePublishableKey: "sb_publishable_test",
  }, fetcher);
  await store.signIn("owner@example.com", "secret");
  const saved = await store.saveSourceExtraction("source-1", {
    method: "pdf-text",
    pageCount: 2,
    characterCount: 500,
    nonEmptyPageCount: 2,
    language: "العربية",
    preview: "معاينة",
    detectedHeadings: ["الوحدة الأولى"],
    requiresOcr: false,
    quality: {
      accepted: true,
      score: 91,
      reason: "accepted",
      message: "اجتاز النص العربي فحص الجودة الأولي.",
      arabicLetterCount: 420,
      wordCount: 90,
      commonWordRatio: 0.22,
      averageWordLength: 4.6,
      longWordRatio: 0.01,
      singleLetterWordRatio: 0.02,
      topFiveLetterShare: 0.49,
      qualityGateVersion: "arabic-quality-gate-1",
    },
    chunks: [
      { chunkIndex: 0, pageFrom: 1, pageTo: 1, content: "نص الصفحة الأولى", characterCount: 16 },
      { chunkIndex: 1, pageFrom: 2, pageTo: 2, content: "نص الصفحة الثانية", characterCount: 17 },
    ],
  });
  assert.equal(saved.chunkCount, 2);
  const dataCalls = calls.filter((call) => call.url.includes("/rest/v1/"));
  assert.equal(dataCalls.length, 3);
  assert.equal(dataCalls[0].init.method, "DELETE");
  assert.equal(dataCalls[1].init.method, "POST");
  assert.equal(dataCalls[2].init.method, "PATCH");
  const summary = JSON.parse(dataCalls[2].init.body);
  assert.equal(summary.extraction_status, "مكتمل");
  assert.equal(summary.status, "مفهرس");
});


test("يلغي فهرسة قديمة مشوهة ويحذف مقاطعها قبل تحويلها إلى OCR", async () => {
  memory.clear();
  const ownerId = "11111111-1111-1111-1111-111111111111";
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/auth/v1/token?grant_type=password")) {
      return Response.json({
        access_token: "user-jwt",
        refresh_token: "refresh-jwt",
        expires_in: 3600,
        user: { id: ownerId, email: "owner@example.com" },
      });
    }
    return new Response(null, { status: 204 });
  };
  const store = new CentralSourceStore({
    supabaseUrl: "https://project.supabase.co",
    supabasePublishableKey: "sb_publishable_test",
  }, fetcher);
  await store.signIn("owner@example.com", "secret");
  await store.invalidateLegacyExtraction("source-1", "طبقة نص مشوهة");
  const dataCalls = calls.filter((call) => call.url.includes("/rest/v1/"));
  assert.equal(dataCalls.length, 2);
  assert.equal(dataCalls[0].init.method, "DELETE");
  assert.match(dataCalls[0].url, /source_chunks/);
  assert.equal(dataCalls[1].init.method, "PATCH");
  const body = JSON.parse(dataCalls[1].init.body);
  assert.equal(body.status, "يحتاج مراجعة");
  assert.equal(body.extraction_status, "يحتاج OCR");
  assert.equal(body.extracted_character_count, null);
  assert.equal(body.extracted_language, null);
  assert.equal(body.extraction_preview, null);
  assert.deepEqual(body.detected_headings, []);
});

test("يقرأ صفحات OCR المحفوظة ويدعم مسحها لإعادة التشغيل", async () => {
  memory.clear();
  const ownerId = "11111111-1111-1111-1111-111111111111";
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/auth/v1/token?grant_type=password")) {
      return Response.json({
        access_token: "user-jwt",
        refresh_token: "refresh-jwt",
        expires_in: 3600,
        user: { id: ownerId, email: "owner@example.com" },
      });
    }
    if (init.method === "GET" && String(url).includes("source_ocr_pages")) {
      return Response.json([{
        owner_id: ownerId,
        source_id: "source-1",
        page_number: 1,
        content: "نص عربي واضح",
        character_count: 13,
        confidence: 0.91,
        provider: "google-cloud-vision",
        processed_at: "2026-07-28T10:00:00.000Z",
      }]);
    }
    return new Response(null, { status: 204 });
  };
  const store = new CentralSourceStore({
    supabaseUrl: "https://project.supabase.co",
    supabasePublishableKey: "sb_publishable_test",
  }, fetcher);
  await store.signIn("owner@example.com", "secret");
  const pages = await store.listOcrPages("source-1");
  assert.equal(pages[0].pageNumber, 1);
  assert.equal(pages[0].confidence, 0.91);
  await store.clearOcrPages("source-1");
  const ocrCalls = calls.filter((call) => call.url.includes("source_ocr_pages"));
  assert.equal(ocrCalls[0].init.method, "GET");
  assert.equal(ocrCalls[1].init.method, "DELETE");
});

test("يحفظ نتيجة OCR الناجحة بإصدار Google Vision", async () => {
  memory.clear();
  const ownerId = "11111111-1111-1111-1111-111111111111";
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/auth/v1/token?grant_type=password")) {
      return Response.json({
        access_token: "user-jwt",
        refresh_token: "refresh-jwt",
        expires_in: 3600,
        user: { id: ownerId, email: "owner@example.com" },
      });
    }
    return new Response(null, { status: 204 });
  };
  const store = new CentralSourceStore({
    supabaseUrl: "https://project.supabase.co",
    supabasePublishableKey: "sb_publishable_test",
  }, fetcher);
  await store.signIn("owner@example.com", "secret");
  await store.saveSourceExtraction("source-1", {
    method: "google-vision-ocr",
    pageCount: 1,
    characterCount: 350,
    nonEmptyPageCount: 1,
    language: "العربية",
    preview: "الوحدة الأولى: المادة",
    detectedHeadings: ["الوحدة الأولى: المادة"],
    requiresOcr: false,
    quality: {
      accepted: true,
      score: 94,
      reason: "accepted",
      message: "اجتاز النص العربي فحص الجودة الأولي.",
      arabicLetterCount: 300,
      wordCount: 70,
      commonWordRatio: 0.2,
      averageWordLength: 4.2,
      longWordRatio: 0,
      singleLetterWordRatio: 0,
      topFiveLetterShare: 0.48,
      qualityGateVersion: "arabic-quality-gate-1",
    },
    chunks: [{ chunkIndex: 0, pageFrom: 1, pageTo: 1, content: "نص عربي واضح ".repeat(25), characterCount: 350 }],
  });
  const patch = calls.filter((call) => call.init.method === "PATCH").at(-1);
  const body = JSON.parse(patch.init.body);
  assert.equal(body.extraction_status, "مكتمل");
  assert.match(body.extraction_version, /^google-cloud-vision-ocr-1-/);
  assert.match(body.extraction_message, /OCR/);
});


test("يرقّي المصدر القديم إلى فصل غير محدد بدل رفضه", () => {
  const legacy = { ...source };
  delete legacy.semester;
  const row = sourceToRow(legacy, "11111111-1111-1111-1111-111111111111");
  assert.equal(row.semester, "غير محدد");
  assert.equal(rowToSource(row).semester, "غير محدد");
});
