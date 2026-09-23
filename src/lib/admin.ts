import { supabase } from "./supabase";

export async function setBanned(userId: string, banned: boolean) {
  const { error } = await supabase.rpc("admin_set_banned", { _user_id: userId, _banned: banned });
  if (error) throw error;
}
