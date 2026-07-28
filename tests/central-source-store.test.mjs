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
  fingerprint: "file|كتاب الطالب|10|physics|2026|physics.pdf",
  authority: "منهج عُماني",
  title: "كتاب الطالب للفيزياء",
  kind: "كتاب الطالب",
  mode: "file",
  grade: 10,
  subjectId: "physics",
  version: "2026",
  fileName: "physics.pdf",
  rightsConfirmed: true,
  status: "جاهز للفهرسة",
  drivePath: "واثق/01_مصادر_المنصة/01_المنهج_العماني/الصف_10/الفيزياء/كتاب_الطالب/",
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
  assert.deepEqual(rowToSource(row), source);
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
  assert.deepEqual(saved, [source]);
  assert.deepEqual(await store.listSources(), [source]);
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
    pageCount: 2,
    characterCount: 500,
    nonEmptyPageCount: 2,
    language: "العربية",
    preview: "معاينة",
    detectedHeadings: ["الوحدة الأولى"],
    requiresOcr: false,
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
