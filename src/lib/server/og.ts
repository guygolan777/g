import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

export type EventOg = { id: string; title: string; image_url: string | null; starts_at: string } | null;

/**
 * Public OG data for /e/{id}. Uses the anon key, so it can only ever read what
 * guests may read (title, image, date/time).
 */
export const getEventOg = createServerFn({ method: "GET" })
  .validator((id: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("bad id");
    return id;
  })
  .handler(async ({ data: id }): Promise<EventOg> => {
    const url = process.env.VITE_SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { data } = await sb.from("events").select("id, title, image_url, starts_at").eq("id", id).maybeSingle();
    return (data as EventOg) ?? null;
  });
