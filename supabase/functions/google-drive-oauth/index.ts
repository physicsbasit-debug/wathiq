import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = requiredEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const GOOGLE_CLIENT_ID = requiredEnv("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = requiredEnv("GOOGLE_CLIENT_SECRET");
const WATHIQ_APP_URL = requiredEnv("WATHIQ_APP_URL");
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/google-drive-oauth`;
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const appOrigin = new URL(WATHIQ_APP_URL).origin;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface DriveConnectionRow {
  owner_id: string;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  granted_scope: string;
  token_type: string;
  folder_map: Record<string, string>;
  connected_at: string;
  updated_at: string;
}

interface GoogleTokenPayload {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface FolderDefinition {
  key: string;
  name: string;
  parentKey: string | null;
}

const folderDefinitions: FolderDefinition[] = [
  { key: "root", name: "واثق", parentKey: null },
  { key: "sources", name: "01_مصادر_المنصة", parentKey: "root" },
  { key: "oman", name: "01_المنهج_العماني", parentKey: "sources" },
  { key: "cambridge", name: "02_اختبارات_كامبريدج", parentKey: "sources" },
  { key: "global", name: "03_مصادر_عالمية", parentKey: "sources" },
  { key: "archive", name: "99_أرشيف_الإصدارات", parentKey: "sources" },
  { key: "generated", name: "02_الاختبارات_المنتجة", parentKey: "root" },
];

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const route = routeName(url.pathname);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    if (route === "callback") return await handleCallback(url);
    const user = await requireUser(req);
    if (route === "start" && req.method === "POST") return await handleStart(req, user.id);
    if (route === "status" && req.method === "GET") return await handleStatus(req, user.id);
    if (route === "verify-folders" && req.method === "POST") return await handleVerifyFolders(req, user.id);
    if (route === "disconnect" && req.method === "POST") return await handleDisconnect(req, user.id);
    return json(req, { error: "المسار المطلوب غير موجود." }, 404);
  } catch (error) {
    if (route === "callback") return redirectToApp("error", errorMessage(error));
    return json(req, { error: errorMessage(error) }, errorStatus(error));
  }
});

async function handleStart(req: Request, ownerId: string): Promise<Response> {
  await admin.from("google_oauth_states").delete().lt("expires_at", new Date().toISOString());
  const state = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const { error } = await admin.from("google_oauth_states").insert({ state, owner_id: ownerId, expires_at: expiresAt });
  if (error) throw new Error(`تعذر إنشاء جلسة ربط Google: ${error.message}`);

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", `${FUNCTION_URL}/callback`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", GOOGLE_SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  return json(req, { ok: true, authUrl: authUrl.toString() });
}

async function handleCallback(url: URL): Promise<Response> {
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const oauthError = url.searchParams.get("error");
  if (oauthError) throw new Error(oauthError === "access_denied" ? "أُلغي ربط Google Drive." : `رفض Google الطلب: ${oauthError}`);
  if (!state || !code) throw new Error("بيانات العودة من Google غير مكتملة.");

  const { data: stateRow, error: stateError } = await admin
    .from("google_oauth_states")
    .delete()
    .eq("state", state)
    .select("owner_id,expires_at")
    .maybeSingle();
  if (stateError || !stateRow) throw new Error("انتهت جلسة ربط Google أو استُخدمت سابقًا.");
  if (new Date(stateRow.expires_at).getTime() <= Date.now()) throw new Error("انتهت مهلة ربط Google Drive. أعد المحاولة.");

  const token = await exchangeCode(code);
  const existing = await getConnection(stateRow.owner_id);
  const refreshToken = token.refresh_token ?? existing?.refresh_token;
  if (!refreshToken) throw new Error("لم يمنح Google رمز تجديد. افصل صلاحية واثق من حساب Google ثم أعد الربط.");

  const accessToken = requireToken(token);
  const folderMap = await ensureFolderTree(accessToken, existing?.folder_map ?? {});
  const now = new Date().toISOString();
  const { error } = await admin.from("google_drive_connections").upsert({
    owner_id: stateRow.owner_id,
    refresh_token: refreshToken,
    access_token: accessToken,
    access_token_expires_at: new Date(Date.now() + (token.expires_in ?? 3600) * 1000).toISOString(),
    granted_scope: token.scope ?? GOOGLE_SCOPE,
    token_type: token.token_type ?? "Bearer",
    folder_map: folderMap,
    connected_at: existing?.connected_at ?? now,
    updated_at: now,
  });
  if (error) throw new Error(`تعذر حفظ اتصال Google Drive: ${error.message}`);

  return redirectToApp("connected", "تم ربط Google Drive.");
}

async function handleStatus(req: Request, ownerId: string): Promise<Response> {
  const connection = await getConnection(ownerId);
  if (!connection) return json(req, statusPayload(null));
  return json(req, statusPayload(connection));
}

async function handleVerifyFolders(req: Request, ownerId: string): Promise<Response> {
  const connection = await requireConnection(ownerId);
  const accessToken = await validAccessToken(connection);
  const folderMap = await ensureFolderTree(accessToken, connection.folder_map ?? {});
  const updatedAt = new Date().toISOString();
  const { error } = await admin
    .from("google_drive_connections")
    .update({ folder_map: folderMap, updated_at: updatedAt })
    .eq("owner_id", ownerId);
  if (error) throw new Error(`تعذر تحديث سجل مجلدات Drive: ${error.message}`);
  return json(req, statusPayload({ ...connection, folder_map: folderMap, updated_at: updatedAt }));
}

async function handleDisconnect(req: Request, ownerId: string): Promise<Response> {
  const connection = await getConnection(ownerId);
  if (connection) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(connection.refresh_token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }).catch(() => undefined);
  }
  const { error } = await admin.from("google_drive_connections").delete().eq("owner_id", ownerId);
  if (error) throw new Error(`تعذر فصل Google Drive: ${error.message}`);
  return json(req, { ok: true, connected: false });
}

async function requireUser(req: Request): Promise<{ id: string; email?: string }> {
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw httpError("يلزم تسجيل دخول مالك المنصة.", 401);
  const token = authorization.slice("Bearer ".length);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw httpError("جلسة مالك المنصة غير صالحة أو منتهية.", 401);
  return { id: data.user.id, email: data.user.email };
}

async function getConnection(ownerId: string): Promise<DriveConnectionRow | null> {
  const { data, error } = await admin
    .from("google_drive_connections")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(`تعذر قراءة اتصال Google Drive: ${error.message}`);
  return data as DriveConnectionRow | null;
}

async function requireConnection(ownerId: string): Promise<DriveConnectionRow> {
  const connection = await getConnection(ownerId);
  if (!connection) throw httpError("Google Drive غير متصل بعد.", 409);
  return connection;
}

async function exchangeCode(code: string): Promise<GoogleTokenPayload> {
  const body = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: `${FUNCTION_URL}/callback`,
    grant_type: "authorization_code",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json() as GoogleTokenPayload;
  if (!response.ok) throw new Error(payload.error_description ?? payload.error ?? "تعذر استبدال رمز Google.");
  return payload;
}

async function validAccessToken(connection: DriveConnectionRow): Promise<string> {
  const expiresAt = connection.access_token_expires_at ? new Date(connection.access_token_expires_at).getTime() : 0;
  if (connection.access_token && expiresAt > Date.now() + 60_000) return connection.access_token;

  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: connection.refresh_token,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json() as GoogleTokenPayload;
  if (!response.ok || !payload.access_token) {
    throw httpError(payload.error_description ?? payload.error ?? "انتهى اتصال Google Drive. أعد الربط.", 401);
  }
  const accessExpiresAt = new Date(Date.now() + (payload.expires_in ?? 3600) * 1000).toISOString();
  const { error } = await admin.from("google_drive_connections").update({
    access_token: payload.access_token,
    access_token_expires_at: accessExpiresAt,
    updated_at: new Date().toISOString(),
  }).eq("owner_id", connection.owner_id);
  if (error) throw new Error(`تعذر تحديث رمز Google: ${error.message}`);
  return payload.access_token;
}

async function ensureFolderTree(accessToken: string, existingMap: Record<string, string>): Promise<Record<string, string>> {
  const folderMap: Record<string, string> = { ...existingMap };
  for (const definition of folderDefinitions) {
    const parentId = definition.parentKey ? folderMap[definition.parentKey] : "root";
    if (!parentId) throw new Error(`تعذر تحديد المجلد الأب لـ ${definition.name}.`);
    const existingId = folderMap[definition.key];
    const validExisting = existingId ? await folderExists(accessToken, existingId, definition.name, parentId) : false;
    folderMap[definition.key] = validExisting
      ? existingId
      : await findOrCreateFolder(accessToken, definition.name, parentId);
  }
  return folderMap;
}

async function folderExists(accessToken: string, fileId: string, expectedName: string, parentId: string): Promise<boolean> {
  const response = await driveFetch(accessToken, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,trashed,parents`);
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(await googleError(response, "تعذر التحقق من مجلد Drive."));
  const file = await response.json() as { name?: string; mimeType?: string; trashed?: boolean; parents?: string[] };
  return file.name === expectedName && file.mimeType === FOLDER_MIME && file.trashed !== true && (file.parents ?? []).includes(parentId);
}

async function findOrCreateFolder(accessToken: string, name: string, parentId: string): Promise<string> {
  const query = [
    `name = '${escapeDriveQuery(name)}'`,
    `mimeType = '${FOLDER_MIME}'`,
    `'${escapeDriveQuery(parentId)}' in parents`,
    "trashed = false",
  ].join(" and ");
  const searchUrl = new URL("https://www.googleapis.com/drive/v3/files");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("spaces", "drive");
  searchUrl.searchParams.set("fields", "files(id,name)");
  searchUrl.searchParams.set("pageSize", "10");
  const foundResponse = await driveFetch(accessToken, searchUrl.toString());
  if (!foundResponse.ok) throw new Error(await googleError(foundResponse, `تعذر البحث عن مجلد ${name}.`));
  const found = await foundResponse.json() as { files?: Array<{ id?: string }> };
  const foundId = found.files?.find((item) => typeof item.id === "string")?.id;
  if (foundId) return foundId;

  const createResponse = await driveFetch(accessToken, "https://www.googleapis.com/drive/v3/files?fields=id,name", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  if (!createResponse.ok) throw new Error(await googleError(createResponse, `تعذر إنشاء مجلد ${name}.`));
  const created = await createResponse.json() as { id?: string };
  if (!created.id) throw new Error(`لم يرجع Google معرف مجلد ${name}.`);
  return created.id;
}

function statusPayload(connection: DriveConnectionRow | null) {
  if (!connection) {
    return { ok: true, connected: false, rootFolderId: "", rootFolderUrl: "", foldersReady: false, folders: [] };
  }
  const map = connection.folder_map ?? {};
  const folders = folderDefinitions.flatMap((definition) => {
    const id = map[definition.key];
    return id ? [{ key: definition.key, name: definition.name, id }] : [];
  });
  const foldersReady = folderDefinitions.every((definition) => Boolean(map[definition.key]));
  return {
    ok: true,
    connected: true,
    rootFolderId: map.root ?? "",
    rootFolderUrl: map.root ? `https://drive.google.com/drive/folders/${encodeURIComponent(map.root)}` : "",
    foldersReady,
    folders,
    connectedAt: connection.connected_at,
    updatedAt: connection.updated_at,
  };
}

function driveFetch(accessToken: string, url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });
}

async function googleError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { error?: { message?: string }; error_description?: string };
    return payload.error?.message ?? payload.error_description ?? `${fallback} (${response.status})`;
  } catch {
    return `${fallback} (${response.status})`;
  }
}

function requireToken(payload: GoogleTokenPayload): string {
  if (!payload.access_token) throw new Error(payload.error_description ?? payload.error ?? "لم يرجع Google رمز وصول.");
  return payload.access_token;
}

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function routeName(pathname: string): string {
  return pathname.split("/").filter(Boolean).at(-1) ?? "";
}

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": origin === appOrigin ? origin : appOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(req: Request, payload: unknown, status = 200): Response {
  return Response.json(payload, { status, headers: corsHeaders(req) });
}

function redirectToApp(state: "connected" | "error", message: string): Response {
  const destination = new URL(WATHIQ_APP_URL);
  destination.searchParams.set("drive", state);
  if (message) destination.searchParams.set("message", message);
  return Response.redirect(destination.toString(), 302);
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`متغير الخادم ${name} غير مضبوط.`);
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "حدث خطأ غير متوقع في ربط Google Drive.";
}

function httpError(message: string, status: number): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

function errorStatus(error: unknown): number {
  if (typeof error === "object" && error !== null && "status" in error && typeof (error as { status?: unknown }).status === "number") {
    return (error as { status: number }).status;
  }
  return 500;
}
