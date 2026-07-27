import type { ManagedSource, SourceStatus } from "./types.js";
import { normalizeManagedSource } from "./source-registry.js";
import type { WathiqRuntimeConfig } from "./runtime-config.js";

const SESSION_KEY = "wathiq.phase0e.ownerSession";

export interface OwnerSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
  email: string;
}

interface AuthPayload {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  user?: { id?: unknown; email?: unknown };
  message?: unknown;
  error_description?: unknown;
  msg?: unknown;
}

interface SourceRow {
  id: string;
  owner_id: string;
  catalog_code: string;
  fingerprint: string;
  authority: string;
  title: string;
  kind: string;
  mode: string;
  grade: number;
  subject_id: string;
  version: string;
  file_name: string | null;
  url: string | null;
  rights_confirmed: boolean;
  status: string;
  drive_path: string;
  created_at: string;
  updated_at: string;
}

type FetchLike = typeof fetch;

const browserFetch: FetchLike = (input, init) => globalThis.fetch(input, init);

function errorMessage(payload: unknown, fallback: string): string {
  if (typeof payload !== "object" || payload === null) return fallback;
  const record = payload as Record<string, unknown>;
  for (const key of ["message", "error_description", "msg", "hint", "details"]) {
    if (typeof record[key] === "string" && record[key]) return record[key] as string;
  }
  return fallback;
}

function parseSession(raw: unknown): OwnerSession | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;
  if (
    typeof value.accessToken !== "string" ||
    typeof value.refreshToken !== "string" ||
    typeof value.expiresAt !== "number" ||
    typeof value.userId !== "string" ||
    typeof value.email !== "string"
  ) return null;
  return value as unknown as OwnerSession;
}

function fromAuthPayload(payload: AuthPayload): OwnerSession {
  if (
    typeof payload.access_token !== "string" ||
    typeof payload.refresh_token !== "string" ||
    typeof payload.expires_in !== "number" ||
    typeof payload.user?.id !== "string"
  ) throw new Error(errorMessage(payload, "تعذر إنشاء جلسة مالك المنصة."));
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
    userId: payload.user.id,
    email: typeof payload.user.email === "string" ? payload.user.email : "",
  };
}

export function sourceToRow(source: ManagedSource, ownerId: string): SourceRow {
  return {
    id: source.id,
    owner_id: ownerId,
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
    rights_confirmed: source.rightsConfirmed,
    status: source.status,
    drive_path: source.drivePath,
    created_at: source.createdAt,
    updated_at: source.updatedAt,
  };
}

export function rowToSource(row: unknown): ManagedSource | null {
  if (typeof row !== "object" || row === null) return null;
  const value = row as Record<string, unknown>;
  const candidate: Record<string, unknown> = {
    id: value.id,
    catalogCode: value.catalog_code,
    fingerprint: value.fingerprint,
    authority: value.authority,
    title: value.title,
    kind: value.kind,
    mode: value.mode,
    grade: value.grade,
    subjectId: value.subject_id,
    version: value.version,
    rightsConfirmed: value.rights_confirmed,
    status: value.status,
    drivePath: value.drive_path,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
  if (typeof value.file_name === "string") candidate.fileName = value.file_name;
  if (typeof value.url === "string") candidate.url = value.url;
  return normalizeManagedSource(candidate);
}

export class CentralSourceStore {
  private session: OwnerSession | null = null;

  constructor(private readonly config: WathiqRuntimeConfig, private readonly fetcher: FetchLike = browserFetch) {}

  get currentSession(): OwnerSession | null {
    return this.session;
  }

  async getActiveSession(): Promise<OwnerSession> {
    return this.requireSession();
  }

  restoreSession(): OwnerSession | null {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      this.session = parseSession(JSON.parse(raw));
    } catch {
      this.session = null;
    }
    if (!this.session) localStorage.removeItem(SESSION_KEY);
    return this.session;
  }

  async signIn(email: string, password: string): Promise<OwnerSession> {
    const response = await this.fetcher(`${this.config.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: this.config.supabasePublishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: email.trim(), password }),
    });
    const payload = await response.json() as AuthPayload;
    if (!response.ok) throw new Error(errorMessage(payload, "تعذر تسجيل الدخول."));
    this.session = fromAuthPayload(payload);
    this.persistSession();
    return this.session;
  }

  async signOut(): Promise<void> {
    const token = this.session?.accessToken;
    this.session = null;
    localStorage.removeItem(SESSION_KEY);
    if (!token) return;
    await this.fetcher(`${this.config.supabaseUrl}/auth/v1/logout`, {
      method: "POST",
      headers: {
        apikey: this.config.supabasePublishableKey,
        Authorization: `Bearer ${token}`,
      },
    }).catch(() => undefined);
  }

  async listSources(): Promise<ManagedSource[]> {
    const payload = await this.dataRequest("/rest/v1/source_registry?select=*&order=created_at.desc", { method: "GET" });
    if (!Array.isArray(payload)) throw new Error("استجابة سجل المصادر غير صالحة.");
    const sources = payload.map(rowToSource).filter((source): source is ManagedSource => source !== null);
    if (sources.length !== payload.length) throw new Error("تعذر قراءة بعض سجلات المصادر المركزية.");
    return sources;
  }

  async upsertSources(sources: ManagedSource[]): Promise<ManagedSource[]> {
    if (!sources.length) return [];
    const session = await this.requireSession();
    const payload = await this.dataRequest(
      "/rest/v1/source_registry?on_conflict=owner_id,fingerprint&select=*",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(sources.map((source) => sourceToRow(source, session.userId))),
      },
    );
    if (!Array.isArray(payload)) throw new Error("تعذر حفظ المصادر في السجل المركزي.");
    return payload.map(rowToSource).filter((source): source is ManagedSource => source !== null);
  }

  async updateStatus(sourceId: string, status: SourceStatus, updatedAt: string): Promise<void> {
    const session = await this.requireSession();
    await this.dataRequest(
      `/rest/v1/source_registry?owner_id=eq.${encodeURIComponent(session.userId)}&id=eq.${encodeURIComponent(sourceId)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status, updated_at: updatedAt }),
      },
    );
  }

  private async dataRequest(path: string, init: RequestInit, allowRetry = true): Promise<unknown> {
    const session = await this.requireSession();
    const response = await this.fetcher(`${this.config.supabaseUrl}${path}`, {
      ...init,
      headers: {
        apikey: this.config.supabasePublishableKey,
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (response.status === 401 && allowRetry) {
      await this.refreshSession();
      return this.dataRequest(path, init, false);
    }
    if (!response.ok) {
      let payload: unknown = null;
      try { payload = await response.json(); } catch { payload = null; }
      throw new Error(errorMessage(payload, `فشل الاتصال بالتخزين المركزي (${response.status}).`));
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) as unknown : null;
  }

  private async requireSession(): Promise<OwnerSession> {
    if (!this.session) throw new Error("يلزم تسجيل دخول مالك المنصة أولًا.");
    if (this.session.expiresAt <= Date.now() + 30_000) await this.refreshSession();
    if (!this.session) throw new Error("انتهت جلسة مالك المنصة.");
    return this.session;
  }

  private async refreshSession(): Promise<void> {
    if (!this.session) throw new Error("لا توجد جلسة قابلة للتجديد.");
    const response = await this.fetcher(`${this.config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: this.config.supabasePublishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: this.session.refreshToken }),
    });
    const payload = await response.json() as AuthPayload;
    if (!response.ok) {
      this.session = null;
      localStorage.removeItem(SESSION_KEY);
      throw new Error(errorMessage(payload, "انتهت الجلسة. سجّل الدخول من جديد."));
    }
    this.session = fromAuthPayload(payload);
    this.persistSession();
  }

  private persistSession(): void {
    if (this.session) localStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
  }
}
