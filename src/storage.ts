import type { ExamDraft, ManagedSource } from "./types.js";

const DRAFT_KEY = "wathiq.phase0b.latestDraft";
const PROFILE_KEY = "wathiq.phase0b.profile";
const SOURCES_KEY = "wathiq.phase0c.sources";

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
  localStorage.setItem(SOURCES_KEY, JSON.stringify(sources));
}

export function loadSources(): ManagedSource[] | null {
  const raw = localStorage.getItem(SOURCES_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ManagedSource[];
  } catch {
    localStorage.removeItem(SOURCES_KEY);
    return null;
  }
}
