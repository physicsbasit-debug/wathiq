import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = requiredEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const GOOGLE_CLIENT_ID = requiredEnv("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = requiredEnv("GOOGLE_CLIENT_SECRET");
const WATHIQ_APP_URL = requiredEnv("WATHIQ_APP_URL");
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/google-drive-oauth`;
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const PDF_MIME = "application/pdf";
const MAX_SOURCE_PDF_BYTES = 500 * 1024 * 1024;
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

interface SourceUploadSessionRow {
  id: string;
  owner_id: string;
  source_id: string;
  catalog_code: string;
  content_fingerprint: string;
  file_name: string;
  mime_type: string;
  total_bytes: number;
  bytes_uploaded: number;
  session_uri: string;
  target_folder_id: string;
  drive_path: string;
  source_payload: Record<string, unknown>;
  status: string;
  drive_file_id: string | null;
  error_message: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

interface GoogleDriveFile {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string;
  webViewLink?: string;
  parents?: string[];
  md5Checksum?: string;
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

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });

  try {
    if (route === "callback") return await handleCallback(url);
    const user = await requireUser(req);
    if (route === "start" && req.method === "POST") return await handleStart(req, user.id);
    if (route === "status" && req.method === "GET") return await handleStatus(req, user.id);
    if (route === "verify-folders" && req.method === "POST") return await handleVerifyFolders(req, user.id);
    if (route === "disconnect" && req.method === "POST") return await handleDisconnect(req, user.id);
    if (route === "prepare-upload" && req.method === "POST") return await handlePrepareUpload(req, user.id);
    if (route === "upload-status" && req.method === "GET") return await handleUploadStatus(req, url, user.id);
    if (route === "upload-chunk" && req.method === "PUT") return await handleUploadChunk(req, user.id);
    if (route === "cancel-upload" && req.method === "POST") return await handleCancelUpload(req, user.id);
    if (route === "archive-source" && req.method === "POST") return await handleArchiveSource(req, user.id);
    if (route === "restore-source" && req.method === "POST") return await handleRestoreSource(req, user.id);
    if (route === "source-file" && req.method === "GET") return await handleSourceFile(req, url, user.id);
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

  const { data: stateRow, error: stateError } = await admin.from("google_oauth_states").delete().eq("state", state).select("owner_id,expires_at").maybeSingle();
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
  return json(req, statusPayload(await getConnection(ownerId)));
}

async function handleVerifyFolders(req: Request, ownerId: string): Promise<Response> {
  const connection = await requireConnection(ownerId);
  const accessToken = await validAccessToken(connection);
  const folderMap = await ensureFolderTree(accessToken, connection.folder_map ?? {});
  const updatedAt = new Date().toISOString();
  const { error } = await admin.from("google_drive_connections").update({ folder_map: folderMap, updated_at: updatedAt }).eq("owner_id", ownerId);
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

async function handlePrepareUpload(req: Request, ownerId: string): Promise<Response> {
  const payload = await req.json() as Record<string, unknown>;
  const source = requireRecord(payload.source, "بيانات المصدر غير مكتملة.");
  const contentFingerprint = requireText(payload.contentFingerprint, "بصمة الملف غير موجودة.");
  const fileName = requireText(payload.fileName, "اسم الملف غير موجود.");
  const mimeType = requireText(payload.mimeType, "نوع الملف غير موجود.");
  const totalBytes = requirePositiveInteger(payload.fileSizeBytes, "حجم الملف غير صالح.");
  if (mimeType !== PDF_MIME || !fileName.toLowerCase().endsWith(".pdf")) throw httpError("يُسمح برفع ملفات PDF فقط.", 400);
  if (totalBytes > MAX_SOURCE_PDF_BYTES) throw httpError("حجم ملف PDF يتجاوز 500 ميجابايت في هذه المرحلة.", 413);

  const { data: duplicate, error: duplicateError } = await admin.from("source_registry")
    .select("catalog_code,title")
    .eq("owner_id", ownerId)
    .eq("content_fingerprint", contentFingerprint)
    .maybeSingle();
  if (duplicateError) throw new Error(`تعذر فحص تكرار الملف: ${duplicateError.message}`);
  if (duplicate) throw httpError(`هذا الملف مرفوع مسبقًا ضمن المصدر ${duplicate.catalog_code}: ${duplicate.title}.`, 409);

  const { data: existingSession, error: existingSessionError } = await admin.from("source_upload_sessions")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("content_fingerprint", contentFingerprint)
    .maybeSingle();
  if (existingSessionError) throw new Error(`تعذر فحص جلسة الرفع السابقة: ${existingSessionError.message}`);
  if (existingSession) {
    const session = existingSession as SourceUploadSessionRow;
    const stillUsable = session.status !== "completed" && new Date(session.expires_at).getTime() > Date.now();
    if (stillUsable) {
      return json(req, {
        ok: true,
        uploadId: session.id,
        bytesUploaded: session.bytes_uploaded,
        totalBytes: session.total_bytes,
        drivePath: session.drive_path,
        resumed: true,
      });
    }
    const { error: deleteSessionError } = await admin.from("source_upload_sessions")
      .delete()
      .eq("id", session.id)
      .eq("owner_id", ownerId);
    if (deleteSessionError) throw new Error(`تعذر تنظيف جلسة الرفع القديمة: ${deleteSessionError.message}`);
  }

  const sourceId = requireText(source.id, "معرف المصدر غير موجود.");
  const catalogCode = requireText(source.catalogCode, "رقم فهرسة المصدر غير موجود.");
  const connection = await requireConnection(ownerId);
  const accessToken = await validAccessToken(connection);
  const folderMap = await ensureFolderTree(accessToken, connection.folder_map ?? {});
  const target = await ensureSourceFolder(accessToken, folderMap, source);
  const sessionUri = await startResumableUpload(accessToken, {
    name: fileName,
    mimeType,
    totalBytes,
    parentId: target.folderId,
    sourceId,
    catalogCode,
    contentFingerprint,
  });
  const uploadId = crypto.randomUUID();
  const now = new Date().toISOString();
  const { error } = await admin.from("source_upload_sessions").insert({
    id: uploadId,
    owner_id: ownerId,
    source_id: sourceId,
    catalog_code: catalogCode,
    content_fingerprint: contentFingerprint,
    file_name: fileName,
    mime_type: mimeType,
    total_bytes: totalBytes,
    bytes_uploaded: 0,
    session_uri: sessionUri,
    target_folder_id: target.folderId,
    drive_path: target.drivePath,
    source_payload: { ...source, drivePath: target.drivePath },
    status: "uploading",
    expires_at: new Date(Date.now() + 6.5 * 24 * 60 * 60_000).toISOString(),
    created_at: now,
    updated_at: now,
  });
  if (error) throw new Error(`تعذر حفظ جلسة رفع الملف: ${error.message}`);
  await updateFolderMap(ownerId, folderMap);
  return json(req, { ok: true, uploadId, bytesUploaded: 0, totalBytes, drivePath: target.drivePath });
}

async function handleUploadStatus(req: Request, url: URL, ownerId: string): Promise<Response> {
  const uploadId = url.searchParams.get("uploadId") ?? "";
  const session = await requireUploadSession(ownerId, uploadId);
  if (session.status === "completed") {
    const source = await getSource(ownerId, session.source_id);
    return json(req, { ok: true, completed: true, bytesUploaded: session.total_bytes, totalBytes: session.total_bytes, source });
  }
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await updateUploadSession(uploadId, { status: "expired", error_message: "انتهت جلسة الرفع." });
    throw httpError("انتهت جلسة رفع الملف. ابدأ الرفع من جديد.", 410);
  }
  const connection = await requireConnection(ownerId);
  const accessToken = await validAccessToken(connection);
  const response = await fetch(session.session_uri, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Range": `bytes */${session.total_bytes}` },
  });
  if (response.status === 308) {
    const bytesUploaded = receivedBytes(response.headers.get("Range"));
    await updateUploadSession(uploadId, { bytes_uploaded: bytesUploaded, updated_at: new Date().toISOString() });
    return json(req, { ok: true, completed: false, bytesUploaded, totalBytes: session.total_bytes });
  }
  if (response.ok) {
    const file = await response.json() as GoogleDriveFile;
    const source = await finalizeUpload(ownerId, session, file);
    return json(req, { ok: true, completed: true, bytesUploaded: session.total_bytes, totalBytes: session.total_bytes, source });
  }
  if (response.status === 404) {
    await updateUploadSession(uploadId, { status: "expired", error_message: "انتهت جلسة Google." });
    throw httpError("انتهت جلسة رفع Google Drive. ابدأ الرفع من جديد.", 410);
  }
  throw new Error(await googleError(response, "تعذر التحقق من حالة رفع الملف."));
}

async function handleUploadChunk(req: Request, ownerId: string): Promise<Response> {
  const uploadId = requireText(req.headers.get("x-wathiq-upload-id"), "معرف جلسة الرفع مفقود.");
  const start = requireNonNegativeInteger(req.headers.get("x-wathiq-upload-start"), "بداية الجزء غير صالحة.");
  const end = requireNonNegativeInteger(req.headers.get("x-wathiq-upload-end"), "نهاية الجزء غير صالحة.");
  const total = requirePositiveInteger(req.headers.get("x-wathiq-upload-total"), "الحجم الكلي غير صالح.");
  const session = await requireUploadSession(ownerId, uploadId);
  if (session.status === "completed") {
    const source = await getSource(ownerId, session.source_id);
    return json(req, { ok: true, completed: true, bytesUploaded: session.total_bytes, totalBytes: session.total_bytes, source });
  }
  if (total !== session.total_bytes || end < start || end >= total) throw httpError("حدود جزء الملف غير متوافقة مع جلسة الرفع.", 400);
  if (start !== session.bytes_uploaded) {
    throw httpError(`موضع الاستكمال تغير. الموضع الصحيح هو ${session.bytes_uploaded}.`, 409);
  }
  const body = await req.arrayBuffer();
  if (body.byteLength !== end - start + 1) throw httpError("حجم جزء الملف لا يطابق حدوده.", 400);

  const connection = await requireConnection(ownerId);
  const accessToken = await validAccessToken(connection);
  const response = await fetch(session.session_uri, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": session.mime_type,
      "Content-Range": `bytes ${start}-${end}/${total}`,
    },
    body,
  });
  if (response.status === 308) {
    const bytesUploaded = receivedBytes(response.headers.get("Range"));
    await updateUploadSession(uploadId, { bytes_uploaded: bytesUploaded, updated_at: new Date().toISOString() });
    return json(req, { ok: true, completed: false, bytesUploaded, totalBytes: total });
  }
  if (!response.ok) {
    const message = await googleError(response, "تعذر رفع جزء الملف إلى Google Drive.");
    await updateUploadSession(uploadId, { status: "failed", error_message: message, updated_at: new Date().toISOString() });
    throw new Error(message);
  }
  const file = await response.json() as GoogleDriveFile;
  const source = await finalizeUpload(ownerId, session, file);
  return json(req, { ok: true, completed: true, bytesUploaded: total, totalBytes: total, source });
}

async function handleCancelUpload(req: Request, ownerId: string): Promise<Response> {
  const payload = await req.json() as Record<string, unknown>;
  const uploadId = requireText(payload.uploadId, "معرف الرفع غير موجود.");
  const { error } = await admin.from("source_upload_sessions").delete().eq("id", uploadId).eq("owner_id", ownerId);
  if (error) throw new Error(`تعذر إلغاء جلسة الرفع: ${error.message}`);
  return json(req, { ok: true });
}

async function handleArchiveSource(req: Request, ownerId: string): Promise<Response> {
  const sourceId = requireText((await req.json() as Record<string, unknown>).sourceId, "معرف المصدر غير موجود.");
  const row = await getSourceRow(ownerId, sourceId);
  if (!row.drive_file_id) throw httpError("هذا المصدر لا يحتوي ملفًا مرفوعًا في Drive.", 409);
  const connection = await requireConnection(ownerId);
  const accessToken = await validAccessToken(connection);
  const archiveId = connection.folder_map?.archive;
  if (!archiveId) throw new Error("مجلد الأرشيف غير جاهز.");
  const currentParent = row.drive_parent_folder_id || row.drive_original_parent_folder_id;
  if (!currentParent) throw new Error("تعذر تحديد المجلد الحالي للملف.");
  await moveDriveFile(accessToken, row.drive_file_id, currentParent, archiveId);
  const now = new Date().toISOString();
  const updated = {
    status: "مؤرشف",
    upload_state: "مؤرشف",
    drive_parent_folder_id: archiveId,
    drive_original_parent_folder_id: row.drive_original_parent_folder_id || currentParent,
    updated_at: now,
  };
  const { data, error } = await admin.from("source_registry").update(updated).eq("owner_id", ownerId).eq("id", sourceId).select("*").single();
  if (error) throw new Error(`تعذر تحديث أرشفة المصدر: ${error.message}`);
  return json(req, { ok: true, source: sourceRowToPayload(data as Record<string, unknown>) });
}

async function handleRestoreSource(req: Request, ownerId: string): Promise<Response> {
  const sourceId = requireText((await req.json() as Record<string, unknown>).sourceId, "معرف المصدر غير موجود.");
  const row = await getSourceRow(ownerId, sourceId);
  if (!row.drive_file_id || !row.drive_original_parent_folder_id) throw httpError("بيانات استعادة الملف غير مكتملة.", 409);
  const connection = await requireConnection(ownerId);
  const accessToken = await validAccessToken(connection);
  const currentParent = row.drive_parent_folder_id || connection.folder_map?.archive;
  if (!currentParent) throw new Error("تعذر تحديد مجلد الأرشيف.");
  await moveDriveFile(accessToken, row.drive_file_id, currentParent, row.drive_original_parent_folder_id);
  const now = new Date().toISOString();
  const restoredStatus = row.extraction_status === "مكتمل" ? "مفهرس" : row.extraction_status === "يحتاج OCR" || row.extraction_status === "فشل" ? "يحتاج مراجعة" : "جاهز للفهرسة";
  const { data, error } = await admin.from("source_registry").update({
    status: restoredStatus,
    upload_state: "مرفوع",
    drive_parent_folder_id: row.drive_original_parent_folder_id,
    updated_at: now,
  }).eq("owner_id", ownerId).eq("id", sourceId).select("*").single();
  if (error) throw new Error(`تعذر استعادة المصدر: ${error.message}`);
  return json(req, { ok: true, source: sourceRowToPayload(data as Record<string, unknown>) });
}

async function handleSourceFile(req: Request, url: URL, ownerId: string): Promise<Response> {
  const sourceId = requireText(url.searchParams.get("sourceId"), "معرف المصدر غير موجود.");
  const row = await getSourceRow(ownerId, sourceId);
  const driveFileId = requireText(row.drive_file_id, "ملف المصدر غير مرفوع إلى Google Drive.");
  if (row.mime_type !== PDF_MIME) throw httpError("هذا المصدر ليس ملف PDF قابلًا للاستخراج.", 409);
  if (row.upload_state === "مؤرشف" || row.status === "مؤرشف") throw httpError("استعد المصدر من الأرشيف قبل استخراج محتواه.", 409);

  const connection = await requireConnection(ownerId);
  const accessToken = await validAccessToken(connection);
  const downloadUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}`);
  downloadUrl.searchParams.set("alt", "media");
  const requestHeaders: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  const range = req.headers.get("Range");
  if (range) requestHeaders.Range = range;
  const response = await fetch(downloadUrl.toString(), { method: "GET", headers: requestHeaders });
  if (!response.ok) throw new Error(await googleError(response, "تعذر تنزيل ملف PDF من Google Drive."));

  const headers = new Headers(corsHeaders(req));
  for (const name of ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified"]) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Content-Type", PDF_MIME);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(typeof row.file_name === "string" ? row.file_name : "source.pdf")}`);
  headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified");
  return new Response(response.body, { status: response.status, headers });
}

async function finalizeUpload(ownerId: string, session: SourceUploadSessionRow, file: GoogleDriveFile): Promise<Record<string, unknown>> {
  if (!file.id) throw new Error("لم يرجع Google معرف الملف بعد اكتمال الرفع.");
  const now = new Date().toISOString();
  const source = {
    ...session.source_payload,
    contentFingerprint: session.content_fingerprint,
    fileSizeBytes: Number(file.size ?? session.total_bytes),
    mimeType: file.mimeType ?? session.mime_type,
    driveFileId: file.id,
    driveParentFolderId: session.target_folder_id,
    driveOriginalParentFolderId: session.target_folder_id,
    driveWebViewLink: file.webViewLink ?? `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`,
    driveMd5Checksum: file.md5Checksum ?? "",
    uploadState: "مرفوع",
    uploadedAt: now,
    status: "جاهز للفهرسة",
    drivePath: session.drive_path,
    updatedAt: now,
  };
  const row = sourcePayloadToRow(ownerId, source);
  const { data, error } = await admin.from("source_registry").upsert(row, { onConflict: "owner_id,id" }).select("*").single();
  if (error) throw new Error(`اكتمل رفع الملف لكن تعذر حفظ سجله: ${error.message}`);
  await updateUploadSession(session.id, {
    status: "completed",
    bytes_uploaded: session.total_bytes,
    drive_file_id: file.id,
    updated_at: now,
    error_message: null,
  });
  return sourceRowToPayload(data as Record<string, unknown>);
}

async function startResumableUpload(
  accessToken: string,
  input: { name: string; mimeType: string; totalBytes: number; parentId: string; sourceId: string; catalogCode: string; contentFingerprint: string },
): Promise<string> {
  const response = await driveFetch(accessToken, "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,webViewLink,parents,md5Checksum", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": input.mimeType,
      "X-Upload-Content-Length": String(input.totalBytes),
    },
    body: JSON.stringify({
      name: input.name,
      mimeType: input.mimeType,
      parents: [input.parentId],
      appProperties: {
        wathiqSourceId: input.sourceId,
        wathiqCatalogCode: input.catalogCode,
        wathiqFingerprint: input.contentFingerprint,
      },
    }),
  });
  if (!response.ok) throw new Error(await googleError(response, "تعذر بدء جلسة رفع Google Drive."));
  const location = response.headers.get("Location");
  if (!location) throw new Error("لم يرجع Google رابط جلسة الرفع القابلة للاستكمال.");
  return location;
}

async function ensureSourceFolder(
  accessToken: string,
  folderMap: Record<string, string>,
  source: Record<string, unknown>,
): Promise<{ folderId: string; drivePath: string }> {
  const kind = requireText(source.kind, "نوع المصدر غير موجود.");
  const grade = requirePositiveInteger(source.grade, "صف المصدر غير صالح.");
  const subjectLabel = safeSegment(requireText(source.subjectLabel, "اسم المادة غير موجود."));
  const gradeSegment = `الصف_${String(grade).padStart(2, "0")}`;
  let baseId: string | undefined;
  let baseName: string;
  let segments: string[];
  if (kind === "اختبار كامبريدج") {
    baseId = folderMap.cambridge;
    baseName = "02_اختبارات_كامبريدج";
    segments = [subjectLabel, gradeSegment, "أوراق_الأسئلة"];
  } else if (kind === "مصدر عالمي") {
    baseId = folderMap.global;
    baseName = "03_مصادر_عالمية";
    segments = [subjectLabel, gradeSegment, "مصادر_مساندة"];
  } else {
    baseId = folderMap.oman;
    baseName = "01_المنهج_العماني";
    segments = [gradeSegment, subjectLabel, folderForKind(kind)];
  }
  if (!baseId) throw new Error("المجلد الأساسي للمصدر غير جاهز.");
  let parentId = baseId;
  for (const segment of segments) parentId = await findOrCreateFolder(accessToken, segment, parentId);
  return { folderId: parentId, drivePath: `واثق/01_مصادر_المنصة/${baseName}/${segments.join("/")}/` };
}

function folderForKind(kind: string): string {
  if (kind === "كتاب الطالب") return "كتاب_الطالب";
  if (kind === "دليل المعلم") return "دليل_المعلم";
  if (kind === "نواتج التعلم") return "نواتج_التعلم";
  if (kind === "جدول المواصفات") return "جداول_المواصفات";
  return "مصادر_مساندة";
}

async function moveDriveFile(accessToken: string, fileId: string, removeParent: string, addParent: string): Promise<void> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set("addParents", addParent);
  url.searchParams.set("removeParents", removeParent);
  url.searchParams.set("fields", "id,parents");
  const response = await driveFetch(accessToken, url.toString(), { method: "PATCH" });
  if (!response.ok) throw new Error(await googleError(response, "تعذر نقل الملف بين مجلدات Drive."));
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
  const { data, error } = await admin.from("google_drive_connections").select("*").eq("owner_id", ownerId).maybeSingle();
  if (error) throw new Error(`تعذر قراءة اتصال Google Drive: ${error.message}`);
  return data as DriveConnectionRow | null;
}

async function requireConnection(ownerId: string): Promise<DriveConnectionRow> {
  const connection = await getConnection(ownerId);
  if (!connection) throw httpError("Google Drive غير متصل بعد.", 409);
  return connection;
}

async function requireUploadSession(ownerId: string, uploadId: string): Promise<SourceUploadSessionRow> {
  if (!uploadId) throw httpError("معرف جلسة الرفع غير موجود.", 400);
  const { data, error } = await admin.from("source_upload_sessions").select("*").eq("id", uploadId).eq("owner_id", ownerId).maybeSingle();
  if (error) throw new Error(`تعذر قراءة جلسة الرفع: ${error.message}`);
  if (!data) throw httpError("جلسة الرفع غير موجودة أو أُلغيت.", 404);
  return data as SourceUploadSessionRow;
}

async function updateUploadSession(uploadId: string, values: Record<string, unknown>): Promise<void> {
  const { error } = await admin.from("source_upload_sessions").update(values).eq("id", uploadId);
  if (error) throw new Error(`تعذر تحديث جلسة الرفع: ${error.message}`);
}

async function getSourceRow(ownerId: string, sourceId: string): Promise<Record<string, unknown>> {
  const { data, error } = await admin.from("source_registry").select("*").eq("owner_id", ownerId).eq("id", sourceId).maybeSingle();
  if (error) throw new Error(`تعذر قراءة المصدر: ${error.message}`);
  if (!data) throw httpError("المصدر غير موجود.", 404);
  return data as Record<string, unknown>;
}

async function getSource(ownerId: string, sourceId: string): Promise<Record<string, unknown>> {
  return sourceRowToPayload(await getSourceRow(ownerId, sourceId));
}

function sourcePayloadToRow(ownerId: string, source: Record<string, unknown>): Record<string, unknown> {
  return {
    owner_id: ownerId,
    id: source.id,
    catalog_code: source.catalogCode,
    fingerprint: source.fingerprint,
    authority: source.authority,
    title: source.title,
    kind: source.kind,
    mode: source.mode,
    grade: source.grade,
    subject_id: source.subjectId,
    version: source.version,
    file_name: source.fileName ?? null,
    url: source.url ?? null,
    rights_confirmed: source.rightsConfirmed ?? true,
    status: source.status ?? "جاهز للفهرسة",
    drive_path: source.drivePath,
    created_at: source.createdAt,
    updated_at: source.updatedAt,
    content_fingerprint: source.contentFingerprint ?? null,
    file_size_bytes: source.fileSizeBytes ?? null,
    mime_type: source.mimeType ?? null,
    drive_file_id: source.driveFileId ?? null,
    drive_parent_folder_id: source.driveParentFolderId ?? null,
    drive_original_parent_folder_id: source.driveOriginalParentFolderId ?? null,
    drive_web_view_link: source.driveWebViewLink ?? null,
    drive_md5_checksum: source.driveMd5Checksum || null,
    upload_state: source.uploadState ?? null,
    uploaded_at: source.uploadedAt ?? null,
    extraction_status: source.extractionStatus ?? null,
    extraction_message: source.extractionMessage ?? null,
    extracted_page_count: source.extractedPageCount ?? null,
    extracted_character_count: source.extractedCharacterCount ?? null,
    extracted_language: source.extractedLanguage ?? null,
    extraction_preview: source.extractionPreview ?? null,
    detected_headings: source.detectedHeadings ?? [],
    extracted_at: source.extractedAt ?? null,
    extraction_version: source.extractionVersion ?? null,
  };
}

function sourceRowToPayload(row: Record<string, unknown>): Record<string, unknown> {
  const source: Record<string, unknown> = {
    id: row.id,
    catalogCode: row.catalog_code,
    fingerprint: row.fingerprint,
    authority: row.authority,
    title: row.title,
    kind: row.kind,
    mode: row.mode,
    grade: row.grade,
    subjectId: row.subject_id,
    version: row.version,
    rightsConfirmed: row.rights_confirmed,
    status: row.status,
    drivePath: row.drive_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  const mappings: Array<[string, string]> = [
    ["file_name", "fileName"], ["url", "url"], ["content_fingerprint", "contentFingerprint"],
    ["mime_type", "mimeType"], ["drive_file_id", "driveFileId"], ["drive_parent_folder_id", "driveParentFolderId"],
    ["drive_original_parent_folder_id", "driveOriginalParentFolderId"], ["drive_web_view_link", "driveWebViewLink"],
    ["drive_md5_checksum", "driveMd5Checksum"], ["upload_state", "uploadState"], ["uploaded_at", "uploadedAt"],
    ["extraction_status", "extractionStatus"], ["extraction_message", "extractionMessage"],
    ["extracted_language", "extractedLanguage"], ["extraction_preview", "extractionPreview"],
    ["extracted_at", "extractedAt"], ["extraction_version", "extractionVersion"],
  ];
  mappings.forEach(([rowKey, sourceKey]) => { if (typeof row[rowKey] === "string" && row[rowKey]) source[sourceKey] = row[rowKey]; });
  if (typeof row.file_size_bytes === "number") source.fileSizeBytes = row.file_size_bytes;
  if (typeof row.extracted_page_count === "number") source.extractedPageCount = row.extracted_page_count;
  if (typeof row.extracted_character_count === "number") source.extractedCharacterCount = row.extracted_character_count;
  if (Array.isArray(row.detected_headings)) source.detectedHeadings = row.detected_headings.filter((item) => typeof item === "string");
  return source;
}

async function exchangeCode(code: string): Promise<GoogleTokenPayload> {
  const body = new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: `${FUNCTION_URL}/callback`, grant_type: "authorization_code" });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const payload = await response.json() as GoogleTokenPayload;
  if (!response.ok) throw new Error(payload.error_description ?? payload.error ?? "تعذر استبدال رمز Google.");
  return payload;
}

async function validAccessToken(connection: DriveConnectionRow): Promise<string> {
  const expiresAt = connection.access_token_expires_at ? new Date(connection.access_token_expires_at).getTime() : 0;
  if (connection.access_token && expiresAt > Date.now() + 60_000) return connection.access_token;
  const body = new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, refresh_token: connection.refresh_token, grant_type: "refresh_token" });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const payload = await response.json() as GoogleTokenPayload;
  if (!response.ok || !payload.access_token) throw httpError(payload.error_description ?? payload.error ?? "انتهى اتصال Google Drive. أعد الربط.", 401);
  const accessExpiresAt = new Date(Date.now() + (payload.expires_in ?? 3600) * 1000).toISOString();
  const { error } = await admin.from("google_drive_connections").update({ access_token: payload.access_token, access_token_expires_at: accessExpiresAt, updated_at: new Date().toISOString() }).eq("owner_id", connection.owner_id);
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
    folderMap[definition.key] = validExisting ? existingId : await findOrCreateFolder(accessToken, definition.name, parentId);
  }
  return folderMap;
}

async function updateFolderMap(ownerId: string, folderMap: Record<string, string>): Promise<void> {
  const { error } = await admin.from("google_drive_connections").update({ folder_map: folderMap, updated_at: new Date().toISOString() }).eq("owner_id", ownerId);
  if (error) throw new Error(`تعذر تحديث خريطة مجلدات Drive: ${error.message}`);
}

async function folderExists(accessToken: string, fileId: string, expectedName: string, parentId: string): Promise<boolean> {
  const response = await driveFetch(accessToken, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,trashed,parents`);
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(await googleError(response, "تعذر التحقق من مجلد Drive."));
  const file = await response.json() as { name?: string; mimeType?: string; trashed?: boolean; parents?: string[] };
  return file.name === expectedName && file.mimeType === FOLDER_MIME && file.trashed !== true && (file.parents ?? []).includes(parentId);
}

async function findOrCreateFolder(accessToken: string, name: string, parentId: string): Promise<string> {
  const query = [`name = '${escapeDriveQuery(name)}'`, `mimeType = '${FOLDER_MIME}'`, `'${escapeDriveQuery(parentId)}' in parents`, "trashed = false"].join(" and ");
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
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  if (!createResponse.ok) throw new Error(await googleError(createResponse, `تعذر إنشاء مجلد ${name}.`));
  const created = await createResponse.json() as { id?: string };
  if (!created.id) throw new Error(`لم يرجع Google معرف مجلد ${name}.`);
  return created.id;
}

function statusPayload(connection: DriveConnectionRow | null) {
  if (!connection) return { ok: true, connected: false, rootFolderId: "", rootFolderUrl: "", foldersReady: false, folders: [] };
  const map = connection.folder_map ?? {};
  const folders = folderDefinitions.flatMap((definition) => map[definition.key] ? [{ key: definition.key, name: definition.name, id: map[definition.key] }] : []);
  return {
    ok: true, connected: true, rootFolderId: map.root ?? "",
    rootFolderUrl: map.root ? `https://drive.google.com/drive/folders/${encodeURIComponent(map.root)}` : "",
    foldersReady: folderDefinitions.every((definition) => Boolean(map[definition.key])), folders,
    connectedAt: connection.connected_at, updatedAt: connection.updated_at,
  };
}

function driveFetch(accessToken: string, url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers ?? {}) } });
}

async function googleError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { error?: { message?: string }; error_description?: string };
    return payload.error?.message ?? payload.error_description ?? `${fallback} (${response.status})`;
  } catch { return `${fallback} (${response.status})`; }
}

function receivedBytes(range: string | null): number {
  const match = range?.match(/bytes=0-(\d+)/);
  return match ? Number(match[1]) + 1 : 0;
}

function requireToken(payload: GoogleTokenPayload): string {
  if (!payload.access_token) throw new Error(payload.error_description ?? payload.error ?? "لم يرجع Google رمز وصول.");
  return payload.access_token;
}

function safeSegment(value: string): string {
  return value.trim().replace(/[\/:*?"<>|]+/g, "-").replace(/\s+/g, "_") || "غير_محدد";
}

function escapeDriveQuery(value: string): string { return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
function routeName(pathname: string): string { return pathname.split("/").filter(Boolean).at(-1) ?? ""; }
function requireRecord(value: unknown, message: string): Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) throw httpError(message, 400); return value as Record<string, unknown>; }
function requireText(value: unknown, message: string): string { if (typeof value !== "string" || !value.trim()) throw httpError(message, 400); return value.trim(); }
function requirePositiveInteger(value: unknown, message: string): number { const parsed = typeof value === "string" ? Number(value) : value; if (typeof parsed !== "number" || !Number.isSafeInteger(parsed) || parsed <= 0) throw httpError(message, 400); return parsed; }
function requireNonNegativeInteger(value: unknown, message: string): number { const parsed = typeof value === "string" ? Number(value) : value; if (typeof parsed !== "number" || !Number.isSafeInteger(parsed) || parsed < 0) throw httpError(message, 400); return parsed; }

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": origin === appOrigin ? origin : appOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, range, x-wathiq-upload-id, x-wathiq-upload-start, x-wathiq-upload-end, x-wathiq-upload-total",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    Vary: "Origin",
  };
}
function json(req: Request, payload: unknown, status = 200): Response { return Response.json(payload, { status, headers: corsHeaders(req) }); }
function redirectToApp(state: "connected" | "error", message: string): Response { const destination = new URL(WATHIQ_APP_URL); destination.searchParams.set("drive", state); if (message) destination.searchParams.set("message", message); return Response.redirect(destination.toString(), 302); }
function requiredEnv(name: string): string { const value = Deno.env.get(name)?.trim(); if (!value) throw new Error(`متغير الخادم ${name} غير مضبوط.`); return value; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : "حدث خطأ غير متوقع في Google Drive."; }
function httpError(message: string, status: number): Error & { status: number } { return Object.assign(new Error(message), { status }); }
function errorStatus(error: unknown): number { if (typeof error === "object" && error !== null && "status" in error && typeof (error as { status?: unknown }).status === "number") return (error as { status: number }).status; return 500; }
