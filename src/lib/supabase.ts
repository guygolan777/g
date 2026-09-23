import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEMO_ANON_KEY, DEMO_URL, DemoSocket, demoFetch, isDemo, seedDemoSession } from "./demo";

const url = isDemo ? DEMO_URL : ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "");
const anonKey = isDemo ? DEMO_ANON_KEY : ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "");

export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

function makeClient(): SupabaseClient {
  const isBrowser = typeof window !== "undefined";
  if (isDemo && isBrowser) seedDemoSession();
  return createClient(url || "http://localhost:54321", anonKey || "public-anon-key", {
    global: isDemo ? { fetch: demoFetch } : undefined,
    realtime: isDemo ? { transport: DemoSocket as never } : undefined,
    auth: {
      persistSession: isBrowser,
      autoRefreshToken: isBrowser,
      detectSessionInUrl: isBrowser,
      storageKey: "mibale-auth",
    },
  });
}

/** Browser: one shared client. Server (SSR): a fresh, session-less client per call. */
export function getSupabase(): SupabaseClient {
  if (typeof window === "undefined") return makeClient();
  client ??= makeClient();
  return client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    const c = getSupabase() as unknown as Record<string | symbol, unknown>;
    const v = c[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(c) : v;
  },
});
