/**
 * The single source of truth for hobby categories. Used by event create/edit,
 * filters, search, discover, communities, signup and profile editing.
 * Category id: "ball". Subcategory id: "ball.football".
 */
export type Subcategory = { id: string; label: string; emoji: string };
export type CategoryTone = "event" | "partner" | "like" | "muted" | "teal" | "violet" | "success";
export type HobbyCategory = { id: string; label: string; emoji: string; tone: CategoryTone; subs: Subcategory[] };

function cat(id: string, label: string, emoji: string, tone: CategoryTone, subs: Array<[string, string, string]>): HobbyCategory {
  return { id, label, emoji, tone, subs: subs.map(([s, l, e]) => ({ id: `${id}.${s}`, label: l, emoji: e })) };
}

export const HOBBY_CATEGORIES: HobbyCategory[] = [
  cat("ball", "משחקי כדור", "⚽", "event", [
    ["football", "כדורגל", "⚽"], ["basketball", "כדורסל", "🏀"], ["tennis", "טניס", "🎾"],
    ["volleyball", "כדורעף", "🏐"], ["padel", "פאדל", "🏓"],
  ]),
  cat("fitness", "כושר ופיטנס", "🏋️", "partner", [
    ["gym", "חדר כושר", "🏋️"], ["running", "ריצה", "🏃"], ["yoga", "יוגה", "🧘"],
    ["cycling", "רכיבה", "🚴"], ["swimming", "שחייה", "🏊"], ["pilates", "פילאטיס", "🤸"],
  ]),
  cat("board", "משחקי קופסא", "🎲", "like", [
    ["strategy", "משחקי אסטרטגיה", "🎲"], ["party", "משחקי מסיבה", "🥳"], ["chess", "שחמט", "♟️"],
    ["escape", "חדר בריחה", "🔐"], ["trivia", "טריוויה", "❓"],
  ]),
  cat("poker", "פוקר", "🃏", "muted", [
    ["beginners", "פוקר למתחילים", "🃏"], ["holdem", "טקסס הולדם", "♠️"], ["tournament", "טורניר", "🏆"],
  ]),
  cat("meet", "סתם להיפגש", "☕", "teal", [
    ["coffee", "קפה", "☕"], ["beer", "בירה", "🍺"], ["dinner", "ארוחה", "🍽️"], ["walk", "הליכה", "🚶"],
    ["picnic", "פיקניק", "🧺"], ["bookclub", "מועדון ספר", "📚"], ["meetup", "מיטאפ", "💬"],
  ]),
  cat("religion", "מפגשי דת", "🕯️", "violet", [
    ["torah", "שיעור תורה", "📖"], ["prayer", "תפילה", "🕯️"], ["shabbat", "סעודת שבת", "🍷"], ["holiday", "חג", "🕎"],
  ]),
  cat("volunteering", "התנדבות", "🤝", "success", [
    ["community", "קהילה", "🤝"], ["animals", "בעלי חיים", "🐶"], ["environment", "סביבה", "🌱"], ["elderly", "גיל הזהב", "👵"],
  ]),
  cat("offroad", "טיולי שטח", "🚙", "event", [
    ["jeep", "ג׳יפים", "🚙"], ["mtb", "אופני שטח", "🚵"], ["hiking", "טיול רגלי", "🥾"],
    ["camping", "קמפינג", "⛺"], ["nature", "הליכת טבע", "🌿"],
  ]),
  cat("fun", "פנאי ופאן", "🎉", "like", [
    ["concert", "הופעה", "🎤"], ["restaurant", "מסעדה", "🍽️"], ["party", "מסיבה", "🎉"], ["cinema", "קולנוע", "🎬"],
    ["bar", "בר", "🍸"], ["standup", "סטנדאפ", "😂"], ["workshop", "סדנה", "🎨"],
  ]),
];

const byId = new Map(HOBBY_CATEGORIES.map((c) => [c.id, c]));
const subById = new Map(HOBBY_CATEGORIES.flatMap((c) => c.subs.map((s) => [s.id, { ...s, category: c }] as const)));

export function getCategory(id: string | null | undefined): HobbyCategory | undefined {
  return id ? byId.get(categoryOf(id)) : undefined;
}

export function getSubcategory(id: string | null | undefined) {
  return id ? subById.get(id) : undefined;
}

/** "ball.football" → "ball"; "ball" → "ball". */
export function categoryOf(hobbyId: string): string {
  return hobbyId.split(".")[0];
}

/** Human label for a category or subcategory id, optionally with emoji. */
/** Category of an event with a free-text title ("מי בא לאכול פלאפל?") — no activity, no label. */
export const CUSTOM_CATEGORY = "other";

export function hobbyLabel(id: string | null | undefined, withEmoji = true): string {
  if (!id || id === CUSTOM_CATEGORY) return "";
  const sub = subById.get(id);
  if (sub) return withEmoji ? `${sub.emoji} ${sub.label}` : sub.label;
  const c = byId.get(id);
  if (c) return withEmoji ? `${c.emoji} ${c.label}` : c.label;
  return id;
}

/** Emoji for an event/community without an image: subcategory first, then category. */
export function hobbyEmoji(id: string | null | undefined): string {
  if (!id) return "✨";
  return subById.get(id)?.emoji ?? byId.get(categoryOf(id))?.emoji ?? "✨";
}

/** Categories implied by a list of hobby ids (categories and subcategories). */
export function categoriesFromHobbies(hobbies: string[]): Set<string> {
  return new Set(hobbies.map(categoryOf));
}

const TONE_CLASSES: Record<CategoryTone, string> = {
  event: "bg-event-soft text-event",
  partner: "bg-partner-soft text-partner-strong",
  like: "bg-like-soft text-like",
  muted: "bg-muted text-foreground",
  teal: "bg-teal-soft text-teal",
  violet: "bg-violet-soft text-violet",
  success: "bg-success-soft text-success",
};

/** Soft colored chip classes for a category/subcategory id (each category has its own tone). */
export function hobbyToneClass(id: string | null | undefined): string {
  return TONE_CLASSES[getCategory(id)?.tone ?? "muted"];
}
