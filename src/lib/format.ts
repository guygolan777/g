const TZ = "Asia/Jerusalem";

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat("he-IL", { timeZone: TZ, ...opts }).format(new Date(iso));
}

export function formatEventWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const day = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(x);
  const time = formatDate(iso, { hour: "2-digit", minute: "2-digit" });
  const tomorrow = new Date(now.getTime() + 86_400_000);
  if (day(d) === day(now)) return `היום · ${time}`;
  if (day(d) === day(tomorrow)) return `מחר · ${time}`;
  return `${formatDate(iso, { weekday: "short", day: "numeric", month: "short" })} · ${time}`;
}

export function formatTime(iso: string): string {
  return formatDate(iso, { hour: "2-digit", minute: "2-digit" });
}

export function formatRelative(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "עכשיו";
  if (diff < 3600) return `לפני ${Math.floor(diff / 60)} דק׳`;
  if (diff < 86400) return `לפני ${Math.floor(diff / 3600)} שע׳`;
  if (diff < 604800) return `לפני ${Math.floor(diff / 86400)} ימים`;
  return formatDate(iso, { day: "numeric", month: "short" });
}

export function ageFromBirthYear(year: number | null | undefined): number | null {
  if (!year) return null;
  return new Date().getFullYear() - year;
}

export function ageFromBirthDate(date: string | null | undefined): number | null {
  if (!date) return null;
  const b = new Date(date);
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}

/** Local "YYYY-MM-DDTHH:mm" for <input type="datetime-local">. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
