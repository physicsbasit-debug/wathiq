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
