import type { WathiqRuntimeConfig } from "./runtime-config.js";

const SESSION_KEY = "wathiq.session.v1";

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

type FetchLike = typeof fetch;
const browserFetch: FetchLike = (input, init) => globalThis.fetch(input, init);

function arabicError(payload: unknown, fallback: string): string {
  if (typeof payload !== "object" || payload === null) return fallback;
  const record = payload as Record<string, unknown>;
  for (const key of ["message", "error_description", "msg", "hint", "details"]) {
    const value = record[key];
    if (typeof value === "string" && /[\u0600-\u06FF]/u.test(value)) return value;
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
  ) throw new Error(arabicError(payload, "تعذر إنشاء جلسة واثق."));
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
    userId: payload.user.id,
    email: typeof payload.user.email === "string" ? payload.user.email : "",
  };
}

export class OwnerSessionService {
  private session: OwnerSession | null = null;

  constructor(private readonly config: WathiqRuntimeConfig, private readonly fetcher: FetchLike = browserFetch) {}

  get currentSession(): OwnerSession | null { return this.session; }

  async getActiveSession(): Promise<OwnerSession> { return this.requireSession(); }

  restoreSession(): OwnerSession | null {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try { this.session = parseSession(JSON.parse(raw)); }
    catch { this.session = null; }
    if (!this.session) localStorage.removeItem(SESSION_KEY);
    return this.session;
  }

  async signIn(email: string, password: string): Promise<OwnerSession> {
    const response = await this.fetcher(`${this.config.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: this.config.supabasePublishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
    });
    const payload = await response.json() as AuthPayload;
    if (!response.ok) throw new Error(arabicError(payload, "تعذر تسجيل الدخول."));
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
      headers: { apikey: this.config.supabasePublishableKey, Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }

  private async requireSession(): Promise<OwnerSession> {
    if (!this.session) throw new Error("سجّل الدخول إلى واثق أولًا.");
    if (this.session.expiresAt - Date.now() > 60_000) return this.session;
    return this.refreshSession();
  }

  private async refreshSession(): Promise<OwnerSession> {
    if (!this.session?.refreshToken) throw new Error("انتهت جلسة واثق. سجّل الدخول من جديد.");
    const response = await this.fetcher(`${this.config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: this.config.supabasePublishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: this.session.refreshToken }),
    });
    const payload = await response.json() as AuthPayload;
    if (!response.ok) {
      this.session = null;
      localStorage.removeItem(SESSION_KEY);
      throw new Error(arabicError(payload, "انتهت جلسة واثق. سجّل الدخول من جديد."));
    }
    this.session = fromAuthPayload(payload);
    this.persistSession();
    return this.session;
  }

  private persistSession(): void {
    if (this.session) localStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
  }
}
