import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const isVideoUrl = (url: string) => /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(url);
/** The profile's small avatar must be a picture: the first photo in the gallery that isn't a video. */
export const firstImage = (media: string[]): string | null => media.find((m) => !isVideoUrl(m)) ?? null;
