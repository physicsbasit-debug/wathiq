import test from "node:test";
import assert from "node:assert/strict";
import { GoogleDriveService } from "../dist/assets/google-drive.js";

const config = {
  supabaseUrl: "https://project.supabase.co",
  supabasePublishableKey: "sb_publishable_test",
  googleOAuthClientId: "client.apps.googleusercontent.com",
};

const centralStore = {
  async getActiveSession() {
    return {
      accessToken: "owner-jwt",
      refreshToken: "refresh-jwt",
      expiresAt: Date.now() + 3600000,
      userId: "owner-1",
      email: "owner@example.com",
    };
  },
};

test("ينشئ رابط ربط Google Drive ويرسل جلسة المالك", async () => {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return Response.json({ authUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=test" });
  };
  const service = new GoogleDriveService(config, centralStore, fetcher);
  const authUrl = await service.beginConnection();
  assert.match(authUrl, /^https:\/\/accounts\.google\.com\//);
  assert.equal(calls[0].url, "https://project.supabase.co/functions/v1/google-drive-oauth/start");
  assert.equal(calls[0].init.headers.Authorization, "Bearer owner-jwt");
  assert.equal(calls[0].init.headers.apikey, "sb_publishable_test");
});

test("يقرأ حالة المجلدات ويعيد التحقق ثم يفصل الاتصال", async () => {
  const calls = [];
  const payload = {
    connected: true,
    rootFolderId: "root-1",
    rootFolderUrl: "https://drive.google.com/drive/folders/root-1",
    foldersReady: true,
    folders: [{ key: "root", name: "واثق", id: "root-1" }],
    connectedAt: "2026-07-27T10:00:00.000Z",
    updatedAt: "2026-07-27T10:00:00.000Z",
  };
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/disconnect")) return Response.json({ ok: true, connected: false });
    return Response.json(payload);
  };
  const service = new GoogleDriveService(config, centralStore, fetcher);
  const status = await service.getStatus();
  assert.equal(status.connected, true);
  assert.equal(status.foldersReady, true);
  assert.equal(status.folders[0].name, "واثق");
  assert.deepEqual(await service.verifyFolders(), status);
  await service.disconnect();
  assert.deepEqual(calls.map((call) => [call.url.split("/").at(-1), call.init.method]), [
    ["status", "GET"],
    ["verify-folders", "POST"],
    ["disconnect", "POST"],
  ]);
});

test("يعرض رسالة Edge Function بدل خطأ عام", async () => {
  const fetcher = async () => Response.json({ error: "Google Drive غير متصل بعد." }, { status: 409 });
  const service = new GoogleDriveService(config, centralStore, fetcher);
  await assert.rejects(() => service.getStatus(), /غير متصل/);
});

test("يستدعي fetch الافتراضي بسياق globalThis", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function () {
    assert.equal(this, globalThis);
    return Response.json({ connected: false, folders: [] });
  };
  try {
    const service = new GoogleDriveService(config, centralStore);
    assert.equal((await service.getStatus()).connected, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ينشئ بصمة مستقرة لملف PDF ويغيّرها عند اختلاف المحتوى", async () => {
  const { computeSourceFileFingerprint } = await import("../dist/assets/google-drive.js");
  const first = new File([new Uint8Array([1, 2, 3, 4])], "source.pdf", {
    type: "application/pdf",
    lastModified: 1,
  });
  const same = new File([new Uint8Array([1, 2, 3, 4])], "renamed.pdf", {
    type: "application/pdf",
    lastModified: 99,
  });
  const different = new File([new Uint8Array([1, 2, 3, 5])], "source.pdf", {
    type: "application/pdf",
    lastModified: 1,
  });
  assert.equal(await computeSourceFileFingerprint(first), await computeSourceFileFingerprint(same));
  assert.notEqual(await computeSourceFileFingerprint(first), await computeSourceFileFingerprint(different));
});

test("يرفع PDF على أجزاء ويحفظ التقدم ثم يمسح الجلسة عند الاكتمال", async () => {
  const memory = new Map();
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem(key) { return memory.has(key) ? memory.get(key) : null; },
    setItem(key, value) { memory.set(key, String(value)); },
    removeItem(key) { memory.delete(key); },
  };

  const source = {
    id: "source-upload-1",
    catalogCode: "WTH-OM-G10-PHY-STU-2026-UPLOAD",
    fingerprint: "file|كتاب الطالب|10|physics|2026|source.pdf",
    authority: "منهج عُماني",
    title: "كتاب الطالب للفيزياء",
    kind: "كتاب الطالب",
    mode: "file",
    grade: 10,
    subjectId: "physics",
    version: "2026",
    fileName: "source.pdf",
    rightsConfirmed: true,
    status: "جاهز للفهرسة",
    uploadState: "غير مرفوع",
    drivePath: "واثق/01_مصادر_المنصة/01_المنهج_العماني/الصف_10/الفيزياء/كتاب_الطالب/",
    createdAt: "2026-07-27T10:00:00.000Z",
    updatedAt: "2026-07-27T10:00:00.000Z",
  };
  const completed = {
    ...source,
    contentFingerprint: "sha256-sample:done",
    fileSizeBytes: 10,
    mimeType: "application/pdf",
    driveFileId: "drive-file-1",
    driveParentFolderId: "folder-1",
    driveWebViewLink: "https://drive.google.com/file/d/drive-file-1/view",
    uploadState: "مرفوع",
    uploadedAt: "2026-07-27T10:01:00.000Z",
  };
  const file = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])], "source.pdf", {
    type: "application/pdf",
    lastModified: 10,
  });
  const chunkCalls = [];
  const fetcher = async (url, init = {}) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/prepare-upload")) {
      return Response.json({ uploadId: "upload-1", bytesUploaded: 0, drivePath: source.drivePath });
    }
    if (path.endsWith("/upload-status")) {
      return Response.json({ uploadId: "upload-1", bytesUploaded: 0, totalBytes: 10, completed: false });
    }
    if (path.endsWith("/upload-chunk")) {
      const start = Number(init.headers["x-wathiq-upload-start"]);
      const end = Number(init.headers["x-wathiq-upload-end"]);
      chunkCalls.push({ start, end, size: init.body.size });
      if (end === 9) return Response.json({ completed: true, bytesUploaded: 10, source: completed });
      return Response.json({ completed: false, bytesUploaded: end + 1 });
    }
    throw new Error(`طلب غير متوقع: ${url}`);
  };

  try {
    const service = new GoogleDriveService(config, centralStore, fetcher, 4);
    const progress = [];
    const result = await service.uploadPdfSource(source, file, (value) => progress.push(value.percent));
    assert.equal(result.driveFileId, "drive-file-1");
    assert.deepEqual(chunkCalls, [
      { start: 0, end: 3, size: 4 },
      { start: 4, end: 7, size: 4 },
      { start: 8, end: 9, size: 2 },
    ]);
    assert.deepEqual(progress, [0, 40, 80, 100]);
    assert.equal(service.getPendingUpload(), null);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test("يبني رابط تنزيل PDF الآمن بمحارف المصادقة اللازمة", async () => {
  const service = new GoogleDriveService(config, centralStore, async () => {
    throw new Error("لا يجب تنفيذ fetch عند بناء رابط الاستخراج.");
  });
  const access = await service.getPdfSourceAccess("source 1");
  assert.equal(access.url, "https://project.supabase.co/functions/v1/google-drive-oauth/source-file?sourceId=source%201");
  assert.equal(access.httpHeaders.Authorization, "Bearer owner-jwt");
  assert.equal(access.httpHeaders.apikey, "sb_publishable_test");
});
