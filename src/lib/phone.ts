/**
 * Phone numbers: everything is normalized to international digits without "+"
 * (e.g. 972501234567) — the same format GoTrue stores — before hashing or sending.
 */
export const PHONE_REQUIRED = import.meta.env.VITE_PHONE_VERIFICATION === "1";

export type OtpChannel = "whatsapp" | "sms";
/** Channels enabled in Supabase/Twilio, first = default. VITE_OTP_CHANNELS="whatsapp,sms"; default SMS only. */
export const OTP_CHANNELS: OtpChannel[] = (() => {
  const list = ((import.meta.env.VITE_OTP_CHANNELS as string | undefined) ?? "sms")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter((c): c is OtpChannel => c === "whatsapp" || c === "sms");
  return list.length ? [...new Set(list)] : ["sms"];
})();

/** Israeli-first normalization: 050-1234567 / +972 50 123 4567 / 00972… → 972501234567. Null if it isn't a phone. */
export function normalizePhone(input: string, defaultCountry = "972"): string | null {
  let d = input.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = defaultCountry + d.slice(1);
  d = d.replace(/\D/g, "");
  if (d.startsWith("9720")) d = "972" + d.slice(4); // +972 0501234567
  if (d.length < 9 || d.length > 15) return null;
  if (d.startsWith("972") && !/^972(5\d{8}|[23489]\d{7}|7\d{8})$/.test(d)) return null;
  return d;
}

/** Mobile numbers only (SMS codes can't reach landlines). */
export function isMobile(digits: string): boolean {
  return digits.startsWith("972") ? /^9725\d{8}$/.test(digits) : true;
}

/** 972501234567 → 050-123-4567 (Israel) or +<digits>. */
export function formatPhone(digits: string | null | undefined): string {
  if (!digits) return "";
  if (/^9725\d{8}$/.test(digits)) return `0${digits.slice(3, 5)}-${digits.slice(5, 8)}-${digits.slice(8)}`;
  return `+${digits}`;
}

/** SHA-256 hex of the normalized digits — matches app_private.phone_hash() in the database. */
export async function hashPhone(digits: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(digits));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
