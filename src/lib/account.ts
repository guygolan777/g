import { supabase } from "@/lib/supabase";

/** All file paths under media/{uid}/ (the only place a user can upload to). */
async function listMyMedia(prefix: string, depth = 0): Promise<string[]> {
  const { data } = await supabase.storage.from("media").list(prefix, { limit: 1000 });
  const out: string[] = [];
  for (const item of data ?? []) {
    const path = `${prefix}/${item.name}`;
    if (item.id) out.push(path);
    else if (depth < 3) out.push(...(await listMyMedia(path, depth + 1)));
  }
  return out;
}

/** Deletes the signed-in user's media, then the account itself (cascades server-side), then signs out. */
export async function deleteMyAccount(userId: string): Promise<boolean> {
  const files = await listMyMedia(userId).catch(() => []);
  for (let i = 0; i < files.length; i += 100) await supabase.storage.from("media").remove(files.slice(i, i + 100));
  const { error } = await supabase.rpc("delete_my_account");
  if (error) return false;
  await supabase.auth.signOut({ scope: "local" });
  return true;
}
