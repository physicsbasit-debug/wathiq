import type { CentralSourceStore } from "./central-source-store.js";
import type { WathiqRuntimeConfig } from "./runtime-config.js";

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
}

type FetchLike = typeof fetch;
const browserFetch: FetchLike = (input, init) => globalThis.fetch(input, init);

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

export class GoogleDriveService {
  private readonly endpoint: string;

  constructor(
    private readonly config: WathiqRuntimeConfig,
    private readonly centralStore: CentralSourceStore,
    private readonly fetcher: FetchLike = browserFetch,
  ) {
    this.endpoint = `${config.supabaseUrl}/functions/v1/google-drive-oauth`;
  }

  async beginConnection(): Promise<string> {
    const payload = await this.request("/start", { method: "POST" });
    if (typeof payload.authUrl !== "string" || !payload.authUrl.startsWith("https://accounts.google.com/")) {
      throw new Error("تعذر إنشاء رابط ربط Google Drive.");
    }
    return payload.authUrl;
  }

  async getStatus(): Promise<GoogleDriveStatus> {
    return parseStatus(await this.request("/status", { method: "GET" }));
  }

  async verifyFolders(): Promise<GoogleDriveStatus> {
    return parseStatus(await this.request("/verify-folders", { method: "POST" }));
  }

  async disconnect(): Promise<void> {
    await this.request("/disconnect", { method: "POST" });
  }

  private async request(path: string, init: RequestInit): Promise<EdgePayload> {
    const session = await this.centralStore.getActiveSession();
    const response = await this.fetcher(`${this.endpoint}${path}`, {
      ...init,
      headers: {
        apikey: this.config.supabasePublishableKey,
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
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
