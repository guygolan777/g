import { supabase } from "./supabase";

/** Upload into the public "media" bucket under the user's own folder. Returns the public URL. */
export async function uploadMedia(userId: string, file: Blob, folder: string, ext?: string): Promise<string> {
  const extension = ext ?? (file instanceof File ? file.name.split(".").pop() : undefined) ?? "bin";
  const path = `${userId}/${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("media").upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  return supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
}
