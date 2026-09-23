/**
 * The single source of truth for hobby categories. Used by event create/edit,
 * filters, search, discover, communities, signup and profile editing.
 * Category id: "sport". Subcategory id: "sport.running".
 */
export type Subcategory = { id: string; label: string };
export type HobbyCategory = { id: string; label: string; emoji: string; subs: Subcategory[] };

function cat(id: string, label: string, emoji: string, subs: Array<[string, string]>): HobbyCategory {
  return { id, label, emoji, subs: subs.map(([s, l]) => ({ id: `${id}.${s}`, label: l })) };
}

export const HOBBY_CATEGORIES: HobbyCategory[] = [
  cat("sport", "ספורט וכושר", "🏃", [
    ["running", "ריצה"], ["football", "כדורגל"], ["basketball", "כדורסל"], ["tennis", "טניס ופאדל"],
    ["yoga", "יוגה"], ["gym", "חדר כושר"], ["cycling", "רכיבה על אופניים"], ["swimming", "שחייה"],
  ]),
  cat("outdoors", "טבע וטיולים", "🏕️", [
    ["hiking", "טיולים רגליים"], ["camping", "קמפינג"], ["jeep", "טיולי ג'יפים"], ["birds", "צפרות"],
    ["climbing", "טיפוס"], ["beach", "ים וחופים"],
  ]),
  cat("music", "מוזיקה", "🎵", [
    ["concerts", "הופעות"], ["jam", "ג'אם סשן"], ["choir", "שירה ומקהלה"], ["dj", "DJ ומוזיקה אלקטרונית"],
    ["instruments", "נגינה"],
  ]),
  cat("food", "אוכל ובישול", "🍕", [
    ["cooking", "סדנאות בישול"], ["restaurants", "מסעדות"], ["baking", "אפייה"], ["wine", "יין ובירה"],
    ["coffee", "בתי קפה"],
  ]),
  cat("culture", "תרבות ואמנות", "🎭", [
    ["theater", "תיאטרון"], ["cinema", "קולנוע"], ["museums", "מוזיאונים וגלריות"], ["standup", "סטנדאפ"],
    ["dance_shows", "מחול"],
  ]),
  cat("party", "מסיבות ובילוי", "🎉", [
    ["bars", "ברים"], ["parties", "מסיבות"], ["karaoke", "קריוקי"], ["dancing", "ריקודים"],
  ]),
  cat("games", "משחקים", "🎲", [
    ["board", "משחקי קופסה"], ["gaming", "גיימינג"], ["escape", "חדרי בריחה"], ["cards", "קלפים"],
    ["chess", "שחמט"],
  ]),
  cat("learning", "לימוד והעשרה", "📚", [
    ["lectures", "הרצאות"], ["books", "מועדון ספר"], ["languages", "שפות"], ["workshops", "סדנאות"],
  ]),
  cat("tech", "טכנולוגיה ויזמות", "💻", [
    ["meetups", "מיטאפים"], ["hackathons", "האקתונים"], ["startups", "סטארטאפים"], ["ai", "בינה מלאכותית"],
  ]),
  cat("wellness", "בריאות ורוחניות", "🧘", [
    ["meditation", "מדיטציה"], ["pilates", "פילאטיס"], ["nutrition", "תזונה"], ["retreat", "ריטריטים"],
  ]),
  cat("family", "הורים וילדים", "👨‍👩‍👧", [
    ["kids", "פעילויות לילדים"], ["parents", "מפגשי הורים"], ["playgrounds", "גינות ומשחקיות"],
  ]),
  cat("volunteering", "התנדבות", "🤝", [
    ["community", "קהילה"], ["animals", "בעלי חיים"], ["environment", "סביבה"], ["elderly", "גיל הזהב"],
  ]),
  cat("pets", "חיות מחמד", "🐶", [
    ["dog_walks", "טיולי כלבים"], ["adoption", "אימוץ"], ["training", "אילוף"],
  ]),
  cat("creative", "יצירה ועיצוב", "🎨", [
    ["photography", "צילום"], ["painting", "ציור"], ["ceramics", "קרמיקה"], ["knitting", "סריגה ותפירה"],
    ["writing", "כתיבה"],
  ]),
];

const byId = new Map(HOBBY_CATEGORIES.map((c) => [c.id, c]));
const subById = new Map(HOBBY_CATEGORIES.flatMap((c) => c.subs.map((s) => [s.id, { ...s, category: c }] as const)));

export function getCategory(id: string | null | undefined): HobbyCategory | undefined {
  return id ? byId.get(id) : undefined;
}

export function getSubcategory(id: string | null | undefined) {
  return id ? subById.get(id) : undefined;
}

/** "sport.running" → "sport"; "sport" → "sport". */
export function categoryOf(hobbyId: string): string {
  return hobbyId.split(".")[0];
}

/** Human label for a category or subcategory id, with emoji. */
export function hobbyLabel(id: string | null | undefined, withEmoji = true): string {
  if (!id) return "";
  const sub = subById.get(id);
  if (sub) return withEmoji ? `${sub.category.emoji} ${sub.label}` : sub.label;
  const c = byId.get(id);
  if (c) return withEmoji ? `${c.emoji} ${c.label}` : c.label;
  return id;
}

/** Categories implied by a list of hobby ids (categories and subcategories). */
export function categoriesFromHobbies(hobbies: string[]): Set<string> {
  return new Set(hobbies.map(categoryOf));
}
