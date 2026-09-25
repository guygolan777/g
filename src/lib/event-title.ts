/**
 * Every event title is displayed as a question: "מי בא ל" + title + "?" ("מי בא לכדורגל?").
 * The single place this happens (the database mirrors it in app_private.who_comes for notifications).
 */
export function whoComesTitle(title: string | null | undefined): string {
  const t = (title ?? "").trim();
  if (!t) return "מי בא?";
  const body = (t.startsWith("מי בא ל") ? t : `מי בא ל${t}`).replace(/\?+$/, "");
  return t.endsWith("!") ? body : `${body}?`;
}
