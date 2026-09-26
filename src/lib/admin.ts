import { supabase } from "./supabase";
import type { Report } from "./types";

export async function setBanned(userId: string, banned: boolean) {
  const { error } = await supabase.rpc("admin_set_banned", { _user_id: userId, _banned: banned });
  if (error) throw error;
}

/** Suspension lengths offered to staff; null hours = permanent. */
export const SUSPEND_OPTIONS: Array<{ label: string; hours: number | null }> = [
  { label: "24 שעות", hours: 24 },
  { label: "3 ימים", hours: 72 },
  { label: "שבוע", hours: 24 * 7 },
  { label: "חודש", hours: 24 * 30 },
  { label: "לצמיתות", hours: null },
];

async function call(fn: string, args: Record<string, unknown>) {
  const { error } = await supabase.rpc(fn, args);
  if (error) throw error;
}

export const moderation = {
  suspend: (userId: string, hours: number | null, reason: string) =>
    call("admin_suspend", { _user_id: userId, _until: hours == null ? null : new Date(Date.now() + hours * 3_600_000).toISOString(), _reason: reason }),
  unsuspend: (userId: string) => call("admin_unsuspend", { _user_id: userId, _reason: "" }),
  warn: (userId: string, reason: string) => call("admin_warn", { _user_id: userId, _reason: reason }),
  remove: (type: Report["target_type"], id: string, reason: string) => call("admin_remove_content", { _type: type, _id: id, _reason: reason }),
  setHidden: (type: Report["target_type"], id: string, hidden: boolean) => call("admin_set_hidden", { _type: type, _id: id, _hidden: hidden }),
  resolve: (type: Report["target_type"], id: string, status: "resolved" | "dismissed", note = "") =>
    call("admin_resolve_reports", { _type: type, _id: id, _status: status, _note: note }),
  setRole: (userId: string, role: "admin" | "moderator" | "user") => call("admin_set_role", { _user_id: userId, _role: role }),
  setWord: (word: string, action: "flag" | "block" | null) => call("admin_set_word", { _word: word, _action: action }),
};

/** Server error → Hebrew for staff toasts. */
export function moderationError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? "";
  if (m.includes("only an admin")) return "רק מנהל/ת ראשי/ת יכול/ה לפעול מול אנשי צוות";
  if (m.includes("yourself")) return "אי אפשר לפעול על החשבון שלך";
  if (m.includes("reason required")) return "צריך לכתוב סיבה";
  if (m.includes("forbidden")) return "אין הרשאה";
  return "הפעולה נכשלה";
}

export const TARGET_LABEL: Record<Report["target_type"], string> = {
  profile: "פרופיל",
  event: "אירוע",
  community: "קהילה",
  story: "סטורי",
  message: "הודעה",
  post: "פוסט",
};

export const ACTION_LABEL: Record<string, string> = {
  warn: "אזהרה",
  suspend: "השהיה",
  unsuspend: "החזרת גישה",
  remove_content: "הסרת תוכן",
  hide: "הסתרה",
  unhide: "החזרת תוכן",
  auto_hide: "הסתרה אוטומטית",
  resolve: "דיווח טופל",
  dismiss: "דיווח נדחה",
  set_role: "שינוי תפקיד",
  word_add: "הוספת מילה",
  word_remove: "הסרת מילה",
};
