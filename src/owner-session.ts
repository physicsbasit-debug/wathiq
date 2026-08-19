import { createClient } from "@supabase/supabase-js";
import { getRuntimeConfig } from "./runtime-config.js";

export interface OwnerSession {
    accessToken: string;
}

export async function requireOwnerSession(): Promise<OwnerSession> {
    const config = getRuntimeConfig();
    const supabase = createClient(config.supabaseUrl, config.supabasePublishableKey);
    
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session) {
        throw new Error("تعذر التحقق من الجلسة. يرجى تسجيل الدخول بصلاحيات المالك.");
    }
    
    return { accessToken: session.access_token };
}
