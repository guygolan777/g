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
  // Android crashes on register() when the build has no Firebase config (google-services.json).
  if (Capacitor.getPlatform() === "android" && import.meta.env.VITE_PUSH_ENABLED !== "1") return;
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
    if (url.startsWith(NATIVE_AUTH_REDIRECT)) return; // handled by listenAuthCallback
    try {
      const u = new URL(url.replace(/^mibale:\/\//, "https://mibale.app/"));
      onOpen(u.pathname + u.search);
    } catch {
      /* ignore malformed links */
    }
  });
}

/** OAuth on the phone runs in the system browser (Google refuses in-app WebViews) and returns here. */
export const NATIVE_AUTH_REDIRECT = "mibale://auth-callback";

export async function signInWithProvider(provider: "google" | "apple"): Promise<string | null> {
  if (!isNative()) {
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}/` } });
    return error?.message ?? null;
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: NATIVE_AUTH_REDIRECT, skipBrowserRedirect: true },
  });
  if (error || !data.url) return error?.message ?? "no url";
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url: data.url, presentationStyle: "popover" });
  return null;
}

/** Completes a native OAuth sign-in from mibale://auth-callback (implicit tokens or PKCE code). */
export async function listenAuthCallback(onSignedIn: () => void): Promise<void> {
  if (!isNative()) return;
  const { App } = await import("@capacitor/app");
  await App.addListener("appUrlOpen", async ({ url }) => {
    if (!url.startsWith(NATIVE_AUTH_REDIRECT)) return;
    const { Browser } = await import("@capacitor/browser");
    void Browser.close().catch(() => undefined);
    const u = new URL(url.replace(/^mibale:\/\//, "https://mibale.app/"));
    const hash = new URLSearchParams(u.hash.slice(1));
    const code = u.searchParams.get("code");
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : access_token && refresh_token
        ? await supabase.auth.setSession({ access_token, refresh_token })
        : { error: new Error(hash.get("error_description") ?? "missing tokens") };
    if (error) toast.error("ההתחברות נכשלה, נסו שוב");
    else onSignedIn();
  });
}
