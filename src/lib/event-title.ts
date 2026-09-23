/** Every event title is displayed as "מי בא ל" + title. The single place this happens. */
export function whoComesTitle(title: string | null | undefined): string {
  const t = (title ?? "").trim();
  if (!t) return "מי בא?";
  if (t.startsWith("מי בא ל")) return t;
  return `מי בא ל${t}`;
}
