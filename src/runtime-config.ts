export interface WathiqRuntimeConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
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
  };
}

export function isCentralStorageConfigured(config: WathiqRuntimeConfig): boolean {
  return /^https:\/\/.+\.supabase\.co$/i.test(config.supabaseUrl) && config.supabasePublishableKey.startsWith("sb_publishable_");
}
