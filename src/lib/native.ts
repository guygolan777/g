import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";
import { SITE_URL } from "./constants";
import { supabase } from "./supabase";

export const isNative = () => typeof window !== "undefined" && Capacitor.isNativePlatform();

export async function hapticTap(kind: "light" | "success" = "light") {
  if (!isNative()) {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(kind === "success" ? [10, 40, 10] : 10);
    return;
  }
  const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");
  if (kind === "success") await Haptics.notification({ type: NotificationType.Success });
  else await Haptics.impact({ style: ImpactStyle.Light });
}

export function eventShareUrl(eventId: string) {
  return `${SITE_URL}/e/${eventId}`;
}

/** System share sheet → navigator.share → clipboard fallback. */
export async function shareLink(opts: { title: string; text?: string; url: string }): Promise<void> {
  try {
    if (isNative()) {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title: opts.title, text: opts.text, url: opts.url, dialogTitle: "שיתוף" });
      return;
    }
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share(opts);
      return;
    }
    await navigator.clipboard.writeText(opts.url);
    toast.success("הקישור הועתק");
  } catch (e) {
    if ((e as Error)?.name !== "AbortError") {
      try {
        await navigator.clipboard.writeText(opts.url);
        toast.success("הקישור הועתק");
      } catch {
        toast.error("לא הצלחנו לשתף");
      }
    }
  }
}

export function whatsappShareUrl(text: string, url: string) {
  return `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;
}

/** Real GPS: Capacitor Geolocation on device, browser geolocation on web. */
export async function getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
  try {
    if (isNative()) {
      const { Geolocation } = await import("@capacitor/geolocation");
      const perm = await Geolocation.requestPermissions();
      if (perm.location === "denied") return null;
      const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000 });
      return { lat: p.coords.latitude, lng: p.coords.longitude };
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) return null;
    return await new Promise((resolve) =>
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { timeout: 10000, maximumAge: 600000 },
      ),
    );
  } catch {
    return null;
  }
}

/** Register for FCM push on device and store the token in push_tokens. */
export async function registerPush(onOpen: (link: string) => void): Promise<void> {
  if (!isNative()) return;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") return;
  await PushNotifications.removeAllListeners();
  await PushNotifications.addListener("registration", async (t) => {
    await supabase.rpc("register_push_token", { _token: t.value, _platform: Capacitor.getPlatform() });
  });
  await PushNotifications.addListener("pushNotificationActionPerformed", (a) => {
    const link = (a.notification.data as { link?: string } | undefined)?.link;
    if (link) onOpen(link);
  });
  await PushNotifications.register();
}

/** Deep links: https://mibale.app/e/{id} or mibale://e/{id} → in-app route. */
export async function listenDeepLinks(onOpen: (path: string) => void): Promise<void> {
  if (!isNative()) return;
  const { App } = await import("@capacitor/app");
  await App.addListener("appUrlOpen", ({ url }) => {
    try {
      const u = new URL(url.replace(/^mibale:\/\//, "https://mibale.app/"));
      onOpen(u.pathname + u.search);
    } catch {
      /* ignore malformed links */
    }
  });
}
