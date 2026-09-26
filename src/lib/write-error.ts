/** Hebrew text for the server's safety refusals (word filter, rate limits, suspension); otherwise the fallback. */
export function writeError(error: unknown, fallback: string): string {
  const e = error as { message?: string; code?: string } | null;
  const m = e?.message ?? "";
  if (m.includes("blocked_content")) return "התוכן כולל מילים שאינן מותרות ב-mibale — נסחו מחדש";
  if (m.includes("rate_limited_new_chats")) return "חשבון חדש יכול לפתוח עד 15 שיחות חדשות ביום — נסו שוב מחר";
  if (m.includes("rate_limited")) return "שולחים מהר מדי — נסו שוב בעוד דקה";
  if (m.includes("report_limit")) return "הגעת למספר הדיווחים המרבי להיום";
  if (e?.code === "42501" || m.includes("row-level security")) return "הפעולה לא מותרת כרגע (ייתכן שהחשבון מושהה)";
  return fallback;
}
