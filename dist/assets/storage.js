const DRAFT_KEY = "wathiq.phase0b.latestDraft";
const PROFILE_KEY = "wathiq.phase0b.profile";
export function saveDraft(draft) {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}
export function loadDraft() {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        localStorage.removeItem(DRAFT_KEY);
        return null;
    }
}
export function clearDraft() {
    localStorage.removeItem(DRAFT_KEY);
}
export function saveProfile(profile) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}
export function loadProfile() {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        localStorage.removeItem(PROFILE_KEY);
        return null;
    }
}
//# sourceMappingURL=storage.js.map