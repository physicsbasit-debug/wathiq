import type { ManagedSource, SourceExtractionResult, SourceExtractionStatus, SourceOcrPage, SourceStatus, SourceTextChunk } from "./types.js";
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
  semester: string;
  file_name: string | null;
  url: string | null;
  rights_confirmed: boolean;
  status: string;
  drive_path: string;
  created_at: string;
  updated_at: string;
  content_fingerprint: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  extraction_status: string | null;
  extraction_message: string | null;
  extracted_page_count: number | null;
  extracted_character_count: number | null;
  extracted_language: string | null;
  extraction_preview: string | null;
  detected_headings: unknown;
  extracted_at: string | null;
  extraction_version: string | null;
}

interface SourceChunkRow {
  owner_id: string;
  source_id: string;
  chunk_index: number;
  page_from: number;
  page_to: number;
  content: string;
  character_count: number;
}

interface SourceOcrPageRow {
  owner_id: string;
  source_id: string;
  page_number: number;
  content: string;
  character_count: number;
  confidence: number | null;
  provider: string;
  processed_at: string;
}

export interface SourceExtractionSaveResult {
  sourceId: string;
  pageCount: number;
  characterCount: number;
  chunkCount: number;
  requiresOcr: boolean;
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
    // العمود المنشور تاريخيًا يقبل القيمة القديمة؛ نحولها عند الكتابة فقط ونخفيها عن نموذج واثق الحالي.
    authority: source.authority === "مصدر مرفوع" ? "منهج عُماني" : source.authority,
    title: source.title,
    kind: source.kind,
    mode: source.mode,
    grade: source.grade,
    subject_id: source.subjectId,
    // Legacy database columns remain populated for compatibility with the deployed schema.
    version: "current",
    semester: "غير محدد",
    file_name: source.fileName ?? null,
    url: source.url ?? null,
    rights_confirmed: source.rightsConfirmed,
    status: source.status,
    drive_path: source.catalogPath,
    created_at: source.createdAt,
    updated_at: source.updatedAt,
    content_fingerprint: source.contentFingerprint ?? null,
    file_size_bytes: source.fileSizeBytes ?? null,
    mime_type: source.mimeType ?? null,
    extraction_status: source.extractionStatus ?? "لم يبدأ",
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
    rightsConfirmed: value.rights_confirmed,
    status: value.status,
    catalogPath: value.drive_path,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
  if (typeof value.file_name === "string") candidate.fileName = value.file_name;
  if (typeof value.url === "string") candidate.url = value.url;
  const optionalStringFields: Array<[string, string]> = [
    ["content_fingerprint", "contentFingerprint"],
    ["mime_type", "mimeType"],
    ["extraction_status", "extractionStatus"],
    ["extraction_message", "extractionMessage"],
    ["extracted_language", "extractedLanguage"],
    ["extraction_preview", "extractionPreview"],
    ["extracted_at", "extractedAt"],
    ["extraction_version", "extractionVersion"],
  ];
  optionalStringFields.forEach(([rowKey, sourceKey]) => {
    if (typeof value[rowKey] === "string" && value[rowKey]) candidate[sourceKey] = value[rowKey];
  });
  if (typeof value.file_size_bytes === "number") candidate.fileSizeBytes = value.file_size_bytes;
  if (typeof value.extracted_page_count === "number") candidate.extractedPageCount = value.extracted_page_count;
  if (typeof value.extracted_character_count === "number") candidate.extractedCharacterCount = value.extracted_character_count;
  if (Array.isArray(value.detected_headings)) {
    const headings = value.detected_headings.filter((item): item is string => typeof item === "string");
    if (headings.length) candidate.detectedHeadings = headings;
  }
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

  async updateExtractionState(
    sourceId: string,
    extractionStatus: SourceExtractionStatus,
    message: string,
    extractionVersion?: string,
  ): Promise<void> {
    const session = await this.requireSession();
    const now = new Date().toISOString();
    await this.dataRequest(
      `/rest/v1/source_registry?owner_id=eq.${encodeURIComponent(session.userId)}&id=eq.${encodeURIComponent(sourceId)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          extraction_status: extractionStatus,
          extraction_message: message,
          ...(extractionVersion ? { extraction_version: extractionVersion } : {}),
          updated_at: now,
          ...(extractionStatus === "جارٍ الاستخراج" ? { status: "جاهز للفهرسة" } : {}),
          ...(extractionStatus === "فشل" || extractionStatus === "يحتاج OCR" ? { status: "يحتاج مراجعة" } : {}),
        }),
      },
    );
  }

  async listSourceChunks(sourceId: string): Promise<SourceTextChunk[]> {
    const session = await this.requireSession();
    const payload = await this.dataRequest(
      `/rest/v1/source_chunks?owner_id=eq.${encodeURIComponent(session.userId)}&source_id=eq.${encodeURIComponent(sourceId)}&select=*&order=chunk_index.asc`,
      { method: "GET" },
    );
    if (!Array.isArray(payload)) throw new Error("تعذر قراءة مقاطع المصدر المفهرسة.");
    return payload.flatMap((raw) => {
      if (typeof raw !== "object" || raw === null) return [];
      const row = raw as Partial<SourceChunkRow>;
      if (
        typeof row.chunk_index !== "number" ||
        typeof row.page_from !== "number" ||
        typeof row.page_to !== "number" ||
        typeof row.content !== "string" ||
        typeof row.character_count !== "number"
      ) return [];
      return [{
        chunkIndex: row.chunk_index,
        pageFrom: row.page_from,
        pageTo: row.page_to,
        content: row.content,
        characterCount: row.character_count,
      } satisfies SourceTextChunk];
    });
  }

  async listOcrPages(sourceId: string): Promise<SourceOcrPage[]> {
    const session = await this.requireSession();
    const payload = await this.dataRequest(
      `/rest/v1/source_ocr_pages?owner_id=eq.${encodeURIComponent(session.userId)}&source_id=eq.${encodeURIComponent(sourceId)}&select=*&order=page_number.asc`,
      { method: "GET" },
    );
    if (!Array.isArray(payload)) throw new Error("تعذر قراءة صفحات OCR المحفوظة.");
    return payload.flatMap((raw) => {
      if (typeof raw !== "object" || raw === null) return [];
      const row = raw as Partial<SourceOcrPageRow>;
      if (
        typeof row.page_number !== "number" ||
        typeof row.content !== "string" ||
        typeof row.character_count !== "number" ||
        typeof row.provider !== "string" ||
        typeof row.processed_at !== "string"
      ) return [];
      return [{
        pageNumber: row.page_number,
        content: row.content,
        characterCount: row.character_count,
        confidence: typeof row.confidence === "number" ? row.confidence : null,
        provider: row.provider,
        processedAt: row.processed_at,
      } satisfies SourceOcrPage];
    });
  }

  async clearOcrPages(sourceId: string): Promise<void> {
    const session = await this.requireSession();
    await this.dataRequest(
      `/rest/v1/source_ocr_pages?owner_id=eq.${encodeURIComponent(session.userId)}&source_id=eq.${encodeURIComponent(sourceId)}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );
  }

  async saveSourceExtraction(sourceId: string, result: SourceExtractionResult): Promise<SourceExtractionSaveResult> {
    const session = await this.requireSession();
    const ownerId = session.userId;
    const encodedOwner = encodeURIComponent(ownerId);
    const encodedSource = encodeURIComponent(sourceId);
    const now = new Date().toISOString();

    await this.dataRequest(
      `/rest/v1/source_chunks?owner_id=eq.${encodedOwner}&source_id=eq.${encodedSource}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );

    if (!result.requiresOcr) {
      const rows = result.chunks.map((chunk) => this.chunkToRow(ownerId, sourceId, chunk));
      const batchSize = 40;
      for (let offset = 0; offset < rows.length; offset += batchSize) {
        await this.dataRequest(
          "/rest/v1/source_chunks",
          {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify(rows.slice(offset, offset + batchSize)),
          },
        );
      }
    }

    const isOcr = result.method === "google-vision-ocr" || result.method === "gemini-ocr";
    const failedOcr = isOcr && result.requiresOcr;
    const extractionStatus: SourceExtractionStatus = result.requiresOcr
      ? failedOcr ? "فشل" : "يحتاج OCR"
      : "مكتمل";
    const message = failedOcr
      ? "اكتمل تشغيل OCR، لكن النص الناتج لم يجتز بوابة الجودة العربية ويحتاج مراجعة يدوية أو ملفًا أوضح."
      : result.requiresOcr
        ? result.quality.message
        : `${isOcr ? "تم OCR واستخراج" : "تم استخراج"} ${result.characterCount.toLocaleString("en-US")} حرف من ${result.pageCount} صفحة، واجتاز النص بوابة الجودة بدرجة ${result.quality.score} من 100.`;
    await this.dataRequest(
      `/rest/v1/source_registry?owner_id=eq.${encodedOwner}&id=eq.${encodedSource}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: result.requiresOcr ? "يحتاج مراجعة" : "مفهرس",
          extraction_status: extractionStatus,
          extraction_message: message,
          extracted_page_count: result.pageCount,
          extracted_character_count: result.requiresOcr ? null : result.characterCount,
          extracted_language: result.requiresOcr ? null : result.language,
          extraction_preview: result.requiresOcr ? null : result.preview,
          detected_headings: result.requiresOcr ? [] : result.detectedHeadings,
          extracted_at: now,
          extraction_version: isOcr
            ? `gemini-ocr-1-${result.quality.qualityGateVersion}`
            : `pdfjs-4.10.38-wathiq-3-${result.quality.qualityGateVersion}`,
          updated_at: now,
        }),
      },
    );

    return {
      sourceId,
      pageCount: result.pageCount,
      characterCount: result.characterCount,
      chunkCount: result.chunks.length,
      requiresOcr: result.requiresOcr,
    };
  }

  async ocrSourcePage(
    sourceId: string,
    pageNumber: number,
    totalPages: number,
    image: Blob,
  ): Promise<SourceOcrPage> {
    const session = await this.requireSession();
    const response = await this.fetcher(`${this.config.supabaseUrl}/functions/v1/source-ocr`, {
      method: "POST",
      headers: {
        apikey: this.config.supabasePublishableKey,
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": image.type || "image/jpeg",
        "x-wathiq-source-id": sourceId,
        "x-wathiq-page-number": String(pageNumber),
        "x-wathiq-total-pages": String(totalPages),
      },
      body: image,
    });
    let payload: unknown = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (response.status === 401) {
      await this.refreshSession();
      return this.ocrSourcePage(sourceId, pageNumber, totalPages, image);
    }
    if (!response.ok || typeof payload !== "object" || payload === null) {
      throw new Error(errorMessage(payload, `تعذر OCR للصفحة ${pageNumber} (${response.status}).`));
    }
    const record = payload as Record<string, unknown>;
    if (typeof record.content !== "string" || typeof record.processedAt !== "string") {
      throw new Error(`استجابة OCR للصفحة ${pageNumber} غير صالحة.`);
    }
    return {
      pageNumber,
      content: record.content,
      characterCount: typeof record.characterCount === "number" ? record.characterCount : record.content.length,
      confidence: typeof record.confidence === "number" ? record.confidence : null,
      provider: typeof record.provider === "string" ? record.provider : "gemini-ocr",
      processedAt: record.processedAt,
    };
  }

  async invalidateLegacyExtraction(sourceId: string, message: string): Promise<void> {
    const session = await this.requireSession();
    const encodedOwner = encodeURIComponent(session.userId);
    const encodedSource = encodeURIComponent(sourceId);
    const now = new Date().toISOString();

    await this.dataRequest(
      `/rest/v1/source_chunks?owner_id=eq.${encodedOwner}&source_id=eq.${encodedSource}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );
    await this.dataRequest(
      `/rest/v1/source_registry?owner_id=eq.${encodedOwner}&id=eq.${encodedSource}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "يحتاج مراجعة",
          extraction_status: "يحتاج OCR",
          extraction_message: message,
          extracted_character_count: null,
          extracted_language: null,
          extraction_preview: null,
          detected_headings: [],
          extraction_version: "pdfjs-4.10.38-wathiq-2-arabic-quality-gate-1",
          updated_at: now,
        }),
      },
    );
  }

  private chunkToRow(ownerId: string, sourceId: string, chunk: SourceTextChunk): Record<string, unknown> {
    return {
      owner_id: ownerId,
      source_id: sourceId,
      chunk_index: chunk.chunkIndex,
      page_from: chunk.pageFrom,
      page_to: chunk.pageTo,
      content: chunk.content,
      character_count: chunk.characterCount,
    };
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
