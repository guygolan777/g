import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const isVideoUrl = (url: string) => /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(url);
/**
 * Android's WebView paints a big grey "play" placeholder over a video until it has a frame.
 * A transparent poster hides it, and "#t=0.1" makes the browser load and show the first frame.
 */
export const VIDEO_POSTER = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
export const videoFrameSrc = (url: string) => (url.includes("#") ? url : `${url}#t=0.1`);
/** The profile's small avatar must be a picture: the first photo in the gallery that isn't a video. */
export const firstImage = (media: string[]): string | null => media.find((m) => !isVideoUrl(m)) ?? null;
