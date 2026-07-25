import type { ExamDraft, ManagedSource } from "./types.js";
import { normalizeManagedSource } from "./source-registry.js";

const DRAFT_KEY = "wathiq.phase0b.latestDraft";
const PROFILE_KEY = "wathiq.phase0b.profile";
const SOURCES_KEY = "wathiq.phase0d.sourceRegistry";
const LEGACY_SOURCES_KEY = "wathiq.phase0c.sources";

export interface SavedProfile {
  school: string;
  directorate: string;
}

export function saveDraft(draft: ExamDraft): void {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function loadDraft(): ExamDraft | null {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ExamDraft;
  } catch {
    localStorage.removeItem(DRAFT_KEY);
    return null;
  }
}

export function clearDraft(): void {
  localStorage.removeItem(DRAFT_KEY);
}

export function saveProfile(profile: SavedProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function loadProfile(): SavedProfile | null {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SavedProfile;
  } catch {
    localStorage.removeItem(PROFILE_KEY);
    return null;
  }
}


export function saveSources(sources: ManagedSource[]): void {
  localStorage.setItem(SOURCES_KEY, JSON.stringify({ schemaVersion: 1, sources }));
}

function readSourceArray(raw: string): ManagedSource[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const values = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { sources?: unknown }).sources)
        ? (parsed as { sources: unknown[] }).sources
        : null;
    if (!values) return null;
    const normalized = values.map(normalizeManagedSource).filter((source): source is ManagedSource => source !== null);
    return normalized.length === values.length ? normalized : null;
  } catch {
    return null;
  }
}

export function loadSources(): ManagedSource[] | null {
  const current = localStorage.getItem(SOURCES_KEY);
  if (current) {
    const sources = readSourceArray(current);
    if (sources) return sources;
    localStorage.removeItem(SOURCES_KEY);
  }

  const legacy = localStorage.getItem(LEGACY_SOURCES_KEY);
  if (!legacy) return null;
  const migrated = readSourceArray(legacy);
  if (!migrated) {
    localStorage.removeItem(LEGACY_SOURCES_KEY);
    return null;
  }
  saveSources(migrated);
  localStorage.removeItem(LEGACY_SOURCES_KEY);
  return migrated;
}
