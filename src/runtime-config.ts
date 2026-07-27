export interface WathiqRuntimeConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
  googleOAuthClientId: string;
}

declare global {
  interface Window {
    __WATHIQ_CONFIG__?: Partial<WathiqRuntimeConfig>;
  }
}

export function getRuntimeConfig(): WathiqRuntimeConfig {
  const raw = window.__WATHIQ_CONFIG__ ?? {};
  return {
    supabaseUrl: String(raw.supabaseUrl ?? "").trim().replace(/\/$/, ""),
    supabasePublishableKey: String(raw.supabasePublishableKey ?? "").trim(),
    googleOAuthClientId: String(raw.googleOAuthClientId ?? "").trim(),
  };
}

export function isCentralStorageConfigured(config: WathiqRuntimeConfig): boolean {
  return /^https:\/\/.+\.supabase\.co$/i.test(config.supabaseUrl) && config.supabasePublishableKey.startsWith("sb_publishable_");
}

export function isGoogleDriveConfigured(config: WathiqRuntimeConfig): boolean {
  return isCentralStorageConfigured(config) && /\.apps\.googleusercontent\.com$/i.test(config.googleOAuthClientId);
}
