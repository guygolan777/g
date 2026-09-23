import { supabase } from "./supabase";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/3gpp": "mp4",
  "video/x-m4v": "m4v",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
};

/** File extension from the MIME type first (Android pickers often send names without one), then the name. */
function extensionFor(file: Blob): string {
  const byType = EXT_BY_TYPE[file.type.split(";")[0].toLowerCase()];
  if (byType) return byType;
  const name = file instanceof File ? file.name : "";
  const fromName = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (/^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (file.type.startsWith("video/")) return "mp4";
  if (file.type.startsWith("image/")) return "jpg";
  return "bin";
}

/** Upload into the public "media" bucket under the user's own folder. Returns the public URL. */
export async function uploadMedia(userId: string, file: Blob, folder: string, ext?: string): Promise<string> {
  const extension = ext ?? extensionFor(file);
  const path = `${userId}/${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("media").upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  return supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
}
