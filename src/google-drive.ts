import type { CentralSourceStore } from "./central-source-store.js";
import type { WathiqRuntimeConfig } from "./runtime-config.js";
import type { ManagedSource, SourceOcrLayoutPage, SourceOcrLayoutWord, SourceOcrPage } from "./types.js";

export type GoogleDriveConnectionState = "غير مهيأ" | "غير متصل" | "متصل" | "خطأ";

export interface GoogleDriveFolderSummary {
  key: string;
  name: string;
  id: string;
}

export interface GoogleDriveStatus {
  connected: boolean;
  rootFolderId: string;
  rootFolderUrl: string;
  foldersReady: boolean;
  folders: GoogleDriveFolderSummary[];
  connectedAt: string;
  updatedAt: string;
}

export interface PdfSourceAccess {
  url: string;
  httpHeaders: Record<string, string>;
}

export interface SourceUploadProgress {
  uploadedBytes: number;
  totalBytes: number;
  percent: number;
  message: string;
}

export interface PendingSourceUpload {
  schemaVersion: 1;
  uploadId: string;
  source: ManagedSource;
  contentFingerprint: string;
  fileName: string;
  fileSizeBytes: number;
  fileLastModified: number;
  mimeType: string;
  bytesUploaded: number;
  chunkSizeBytes: number;
  drivePath: string;
  createdAt: string;
}

interface EdgePayload {
  ok?: unknown;
  connected?: unknown;
  authUrl?: unknown;
  rootFolderId?: unknown;
  rootFolderUrl?: unknown;
  foldersReady?: unknown;
  folders?: unknown;
  connectedAt?: unknown;
  updatedAt?: unknown;
  message?: unknown;
  error?: unknown;
  uploadId?: unknown;
  bytesUploaded?: unknown;
  totalBytes?: unknown;
  completed?: unknown;
  drivePath?: unknown;
  source?: unknown;
  pageNumber?: unknown;
  content?: unknown;
  characterCount?: unknown;
  confidence?: unknown;
  provider?: unknown;
  processedAt?: unknown;
  width?: unknown;
  height?: unknown;
  words?: unknown;
}

type FetchLike = typeof fetch;
const browserFetch: FetchLike = (input, init) => globalThis.fetch(input, init);
const PENDING_UPLOAD_KEY = "wathiq.phase0f2.pendingSourceUpload";
export const SOURCE_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
export const MAX_SOURCE_PDF_BYTES = 500 * 1024 * 1024;

function payloadMessage(payload: unknown, fallback: string): string {
  if (typeof payload !== "object" || payload === null) return fallback;
  const record = payload as Record<string, unknown>;
  for (const key of ["message", "error", "error_description", "msg", "details"]) {
    if (typeof record[key] === "string" && record[key]) return record[key] as string;
  }
  return fallback;
}

function parseFolders(raw: unknown): GoogleDriveFolderSummary[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const value = item as Record<string, unknown>;
    if (typeof value.key !== "string" || typeof value.name !== "string" || typeof value.id !== "string") return [];
    return [{ key: value.key, name: value.name, id: value.id }];
  });
}

function parseStatus(payload: EdgePayload): GoogleDriveStatus {
  return {
    connected: payload.connected === true,
    rootFolderId: typeof payload.rootFolderId === "string" ? payload.rootFolderId : "",
    rootFolderUrl: typeof payload.rootFolderUrl === "string" ? payload.rootFolderUrl : "",
    foldersReady: payload.foldersReady === true,
    folders: parseFolders(payload.folders),
    connectedAt: typeof payload.connectedAt === "string" ? payload.connectedAt : "",
    updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : "",
  };
}

function parsePendingUpload(raw: string | null): PendingSourceUpload | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingSourceUpload>;
    if (
      value.schemaVersion !== 1 ||
      typeof value.uploadId !== "string" ||
      typeof value.contentFingerprint !== "string" ||
      typeof value.fileName !== "string" ||
      typeof value.fileSizeBytes !== "number" ||
      typeof value.fileLastModified !== "number" ||
      typeof value.mimeType !== "string" ||
      typeof value.bytesUploaded !== "number" ||
      typeof value.chunkSizeBytes !== "number" ||
      typeof value.drivePath !== "string" ||
      typeof value.createdAt !== "string" ||
      typeof value.source !== "object" || value.source === null
    ) return null;
    return value as PendingSourceUpload;
  } catch {
    return null;
  }
}

function storageAvailable(): boolean {
  return typeof localStorage !== "undefined";
}

function persistPendingUpload(pending: PendingSourceUpload | null): void {
  if (!storageAvailable()) return;
  if (pending) localStorage.setItem(PENDING_UPLOAD_KEY, JSON.stringify(pending));
  else localStorage.removeItem(PENDING_UPLOAD_KEY);
}

function bytesToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function validateSourcePdf(file: File): void {
  if (!file.name.toLowerCase().endsWith(".pdf")) throw new Error("اختر ملف PDF فقط.");
  if (file.type && file.type !== "application/pdf") throw new Error("نوع الملف لا يطابق PDF.");
  if (file.size <= 0) throw new Error("ملف PDF فارغ.");
  if (file.size > MAX_SOURCE_PDF_BYTES) throw new Error("حجم ملف PDF يتجاوز 500 ميجابايت في هذه المرحلة.");
}

export async function computeSourceFileFingerprint(file: File): Promise<string> {
  validateSourcePdf(file);
  const sampleBytes = 1024 * 1024;
  const first = new Uint8Array(await file.slice(0, Math.min(file.size, sampleBytes)).arrayBuffer());
  const lastStart = Math.max(0, file.size - sampleBytes);
  const last = lastStart === 0 ? new Uint8Array() : new Uint8Array(await file.slice(lastStart).arrayBuffer());
  const metadata = new TextEncoder().encode(`${file.size}|${file.type || "application/pdf"}|`);
  const combined = new Uint8Array(metadata.length + first.length + last.length);
  combined.set(metadata, 0);
  combined.set(first, metadata.length);
  combined.set(last, metadata.length + first.length);
  return `sha256-sample:${bytesToHex(await crypto.subtle.digest("SHA-256", combined))}`;
}

function sourceFromPayload(raw: unknown): ManagedSource {
  if (typeof raw !== "object" || raw === null) throw new Error("لم ترجع خدمة Drive سجل المصدر المكتمل.");
  return raw as ManagedSource;
}

export class GoogleDriveService {
  private readonly endpoint: string;

  constructor(
    private readonly config: WathiqRuntimeConfig,
    private readonly centralStore: CentralSourceStore,
    private readonly fetcher: FetchLike = browserFetch,
    private readonly chunkSizeBytes = SOURCE_UPLOAD_CHUNK_BYTES,
  ) {
    this.endpoint = `${config.supabaseUrl}/functions/v1/google-drive-oauth`;
  }

  async beginConnection(): Promise<string> {
    const payload = await this.requestJson("/start", { method: "POST" });
    if (typeof payload.authUrl !== "string" || !payload.authUrl.startsWith("https://accounts.google.com/")) {
      throw new Error("تعذر إنشاء رابط ربط Google Drive.");
    }
    return payload.authUrl;
  }

  async getStatus(): Promise<GoogleDriveStatus> {
    return parseStatus(await this.requestJson("/status", { method: "GET" }));
  }

  async verifyFolders(): Promise<GoogleDriveStatus> {
    return parseStatus(await this.requestJson("/verify-folders", { method: "POST" }));
  }

  async disconnect(): Promise<void> {
    await this.requestJson("/disconnect", { method: "POST" });
  }

  getPendingUpload(): PendingSourceUpload | null {
    const pending = parsePendingUpload(storageAvailable() ? localStorage.getItem(PENDING_UPLOAD_KEY) : null);
    if (!pending && storageAvailable()) localStorage.removeItem(PENDING_UPLOAD_KEY);
    return pending;
  }

  async uploadPdfSource(
    source: ManagedSource,
    file: File,
    onProgress?: (progress: SourceUploadProgress) => void,
  ): Promise<ManagedSource> {
    validateSourcePdf(file);
    const contentFingerprint = await computeSourceFileFingerprint(file);
    let pending = this.getPendingUpload();
    const matchingPending = pending &&
      pending.source.id === source.id &&
      pending.contentFingerprint === contentFingerprint &&
      pending.fileName === file.name &&
      pending.fileSizeBytes === file.size;

    if (!matchingPending && pending) {
      await this.cancelPendingUpload().catch(() => undefined);
      pending = null;
    }

    {
      const prepared = await this.requestJson("/prepare-upload", {
        method: "POST",
        body: JSON.stringify({
          source: { ...source, contentFingerprint, fileSizeBytes: file.size, mimeType: file.type || "application/pdf" },
          contentFingerprint,
          fileName: file.name,
          fileSizeBytes: file.size,
          mimeType: file.type || "application/pdf",
        }),
      });
      if (typeof prepared.uploadId !== "string") throw new Error("تعذر بدء جلسة رفع الملف.");
      pending = {
        schemaVersion: 1,
        uploadId: prepared.uploadId,
        source: { ...source, contentFingerprint, fileSizeBytes: file.size, mimeType: file.type || "application/pdf", uploadState: "قيد الرفع" },
        contentFingerprint,
        fileName: file.name,
        fileSizeBytes: file.size,
        fileLastModified: file.lastModified,
        mimeType: file.type || "application/pdf",
        bytesUploaded: typeof prepared.bytesUploaded === "number" ? prepared.bytesUploaded : pending?.bytesUploaded ?? 0,
        chunkSizeBytes: pending?.chunkSizeBytes ?? this.chunkSizeBytes,
        drivePath: typeof prepared.drivePath === "string" ? prepared.drivePath : source.drivePath,
        createdAt: pending?.createdAt ?? new Date().toISOString(),
      };
      persistPendingUpload(pending);
    }

    if (!pending) throw new Error("تعذر استعادة جلسة رفع الملف.");
    const status = await this.getUploadStatus(pending.uploadId);
    pending.bytesUploaded = typeof status.bytesUploaded === "number" ? status.bytesUploaded : pending.bytesUploaded;
    persistPendingUpload(pending);

    onProgress?.(this.progress(pending.bytesUploaded, file.size, "جارٍ رفع ملف PDF إلى Google Drive…"));
    while (pending.bytesUploaded < file.size) {
      const start = pending.bytesUploaded;
      const endExclusive = Math.min(start + pending.chunkSizeBytes, file.size);
      const payload = await this.requestBinary("/upload-chunk", file.slice(start, endExclusive), {
        "x-wathiq-upload-id": pending.uploadId,
        "x-wathiq-upload-start": String(start),
        "x-wathiq-upload-end": String(endExclusive - 1),
        "x-wathiq-upload-total": String(file.size),
      });
      pending.bytesUploaded = typeof payload.bytesUploaded === "number" ? payload.bytesUploaded : endExclusive;
      persistPendingUpload(pending);
      onProgress?.(this.progress(pending.bytesUploaded, file.size, payload.completed === true ? "اكتمل الرفع والحفظ." : "جارٍ رفع ملف PDF إلى Google Drive…"));
      if (payload.completed === true) {
        const completedSource = sourceFromPayload(payload.source);
        persistPendingUpload(null);
        return completedSource;
      }
    }
    const finalStatus = await this.getUploadStatus(pending.uploadId);
    if (finalStatus.completed === true) {
      const completedSource = sourceFromPayload(finalStatus.source);
      persistPendingUpload(null);
      return completedSource;
    }
    throw new Error("توقف الرفع قبل اكتماله. اختر الملف نفسه واضغط استكمال الرفع.");
  }

  async cancelPendingUpload(): Promise<void> {
    const pending = this.getPendingUpload();
    if (!pending) return;
    await this.requestJson("/cancel-upload", {
      method: "POST",
      body: JSON.stringify({ uploadId: pending.uploadId }),
    });
    persistPendingUpload(null);
  }

  async archiveSourceFile(sourceId: string): Promise<ManagedSource> {
    return sourceFromPayload((await this.requestJson("/archive-source", {
      method: "POST",
      body: JSON.stringify({ sourceId }),
    })).source);
  }

  async restoreSourceFile(sourceId: string): Promise<ManagedSource> {
    return sourceFromPayload((await this.requestJson("/restore-source", {
      method: "POST",
      body: JSON.stringify({ sourceId }),
    })).source);
  }

  async ocrSourcePage(
    sourceId: string,
    pageNumber: number,
    totalPages: number,
    image: Blob,
  ): Promise<SourceOcrPage> {
    const payload = await this.request("/ocr-page", {
      method: "POST",
      headers: {
        "Content-Type": image.type || "image/jpeg",
        "x-wathiq-source-id": sourceId,
        "x-wathiq-page-number": String(pageNumber),
        "x-wathiq-total-pages": String(totalPages),
      },
      body: image,
    });
    if (
      typeof payload.pageNumber !== "number" ||
      typeof payload.content !== "string" ||
      typeof payload.characterCount !== "number" ||
      typeof payload.provider !== "string" ||
      typeof payload.processedAt !== "string"
    ) throw new Error("لم ترجع خدمة OCR نتيجة الصفحة بصورة صحيحة.");
    return {
      pageNumber: payload.pageNumber,
      content: payload.content,
      characterCount: payload.characterCount,
      confidence: typeof payload.confidence === "number" ? payload.confidence : null,
      provider: payload.provider,
      processedAt: payload.processedAt,
    };
  }


  async ocrSourceLayoutPage(
    sourceId: string,
    pageNumber: number,
    totalPages: number,
    image: Blob,
  ): Promise<SourceOcrLayoutPage> {
    const payload = await this.request("/ocr-layout-page", {
      method: "POST",
      headers: {
        "Content-Type": image.type || "image/jpeg",
        "x-wathiq-source-id": sourceId,
        "x-wathiq-page-number": String(pageNumber),
        "x-wathiq-total-pages": String(totalPages),
      },
      body: image,
    });
    if (
      typeof payload.pageNumber !== "number" ||
      typeof payload.width !== "number" ||
      typeof payload.height !== "number" ||
      !Array.isArray(payload.words) ||
      typeof payload.provider !== "string" ||
      typeof payload.processedAt !== "string"
    ) throw new Error("لم ترجع خدمة OCR الموضعي نتيجة الصفحة بصورة صحيحة.");
    const words = payload.words.flatMap((raw): SourceOcrLayoutWord[] => {
      if (typeof raw !== "object" || raw === null) return [];
      const word = raw as Record<string, unknown>;
      if (
        typeof word.text !== "string" ||
        typeof word.xMin !== "number" ||
        typeof word.yMin !== "number" ||
        typeof word.xMax !== "number" ||
        typeof word.yMax !== "number"
      ) return [];
      return [{
        text: word.text,
        xMin: word.xMin,
        yMin: word.yMin,
        xMax: word.xMax,
        yMax: word.yMax,
        confidence: typeof word.confidence === "number" ? word.confidence : null,
      }];
    });
    if (!words.length) throw new Error("لم ترجع خدمة OCR الموضعي كلمات قابلة للتحليل.");
    return {
      pageNumber: payload.pageNumber,
      width: payload.width,
      height: payload.height,
      words,
      provider: payload.provider,
      processedAt: payload.processedAt,
    };
  }

  async getPdfSourceAccess(sourceId: string): Promise<PdfSourceAccess> {
    const session = await this.centralStore.getActiveSession();
    return {
      url: `${this.endpoint}/source-file?sourceId=${encodeURIComponent(sourceId)}`,
      httpHeaders: {
        apikey: this.config.supabasePublishableKey,
        Authorization: `Bearer ${session.accessToken}`,
      },
    };
  }

  private progress(uploadedBytes: number, totalBytes: number, message: string): SourceUploadProgress {
    return {
      uploadedBytes,
      totalBytes,
      percent: totalBytes > 0 ? Math.min(100, Math.round((uploadedBytes / totalBytes) * 100)) : 0,
      message,
    };
  }

  private async getUploadStatus(uploadId: string): Promise<EdgePayload> {
    return this.requestJson(`/upload-status?uploadId=${encodeURIComponent(uploadId)}`, { method: "GET" });
  }

  private async requestBinary(path: string, body: Blob, headers: Record<string, string>): Promise<EdgePayload> {
    return this.request(path, { method: "PUT", headers, body });
  }

  private async requestJson(path: string, init: RequestInit): Promise<EdgePayload> {
    return this.request(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  }

  private async request(path: string, init: RequestInit): Promise<EdgePayload> {
    const session = await this.centralStore.getActiveSession();
    const response = await this.fetcher(`${this.endpoint}${path}`, {
      ...init,
      headers: {
        apikey: this.config.supabasePublishableKey,
        Authorization: `Bearer ${session.accessToken}`,
        ...(init.headers ?? {}),
      },
    });
    let payload: EdgePayload = {};
    const text = await response.text();
    if (text) {
      try {
        payload = JSON.parse(text) as EdgePayload;
      } catch {
        throw new Error("استجابة خدمة Google Drive غير صالحة.");
      }
    }
    if (!response.ok) {
      throw new Error(payloadMessage(payload, `تعذر الاتصال بخدمة Google Drive (${response.status}).`));
    }
    return payload;
  }
}
