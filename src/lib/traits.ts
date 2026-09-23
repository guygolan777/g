/**
 * Personality traits — the one central list used by onboarding and profile editing.
 */
export type Trait = { id: string; label: string; emoji: string };
export type TraitGroup = { id: string; label: string; single?: boolean; traits: Trait[] };

export const TRAIT_GROUPS: TraitGroup[] = [
  {
    id: "status",
    label: "מצב אישי",
    single: true,
    traits: [
      { id: "single", label: "רווק/ה", emoji: "✨" },
      { id: "relationship", label: "בזוגיות", emoji: "💑" },
      { id: "married", label: "נשוי/אה", emoji: "💍" },
      { id: "divorced", label: "גרוש/ה", emoji: "🌱" },
      { id: "parent", label: "הורה", emoji: "👶" },
    ],
  },
  {
    id: "habits",
    label: "הרגלים",
    traits: [
      { id: "smoker", label: "מעשן/ת", emoji: "🚬" },
      { id: "non_smoker", label: "לא מעשן/ת", emoji: "🚭" },
      { id: "vegetarian", label: "צמחוני/ת", emoji: "🥗" },
      { id: "vegan", label: "טבעוני/ת", emoji: "🌿" },
      { id: "social_drinker", label: "שותה חברתית", emoji: "🍷" },
      { id: "sporty", label: "ספורטיבי/ת", emoji: "💪" },
    ],
  },
  {
    id: "animals",
    label: "בעלי חיים",
    traits: [
      { id: "cat_lover", label: "אוהב/ת חתולים", emoji: "🐱" },
      { id: "dog_lover", label: "אוהב/ת כלבים", emoji: "🐶" },
      { id: "has_pet", label: "יש לי חיית מחמד", emoji: "🐾" },
      { id: "pet_allergy", label: "אלרגי/ת לבעלי חיים", emoji: "🤧" },
    ],
  },
  {
    id: "character",
    label: "אופי",
    traits: [
      { id: "extrovert", label: "מוחצן/ת", emoji: "🎤" },
      { id: "introvert", label: "מופנם/ת", emoji: "📖" },
      { id: "funny", label: "הומוריסטי/ת", emoji: "😂" },
      { id: "romantic", label: "רומנטי/ת", emoji: "🌹" },
      { id: "adventurous", label: "הרפתקן/ית", emoji: "🧗" },
      { id: "calm", label: "רגוע/ה", emoji: "🌊" },
      { id: "ambitious", label: "אמביציוזי/ת", emoji: "🚀" },
      { id: "creative", label: "יצירתי/ת", emoji: "🎨" },
      { id: "optimist", label: "אופטימי/ת", emoji: "☀️" },
    ],
  },
  {
    id: "religion",
    label: "תחומי חיים",
    single: true,
    traits: [
      { id: "secular", label: "חילוני/ת", emoji: "🌍" },
      { id: "traditional", label: "מסורתי/ת", emoji: "🕯️" },
      { id: "keeps_tradition", label: "שומר/ת מסורת", emoji: "🍷" },
      { id: "religious", label: "דתי/ה", emoji: "📜" },
      { id: "orthodox", label: "חרדי/ת", emoji: "🎩" },
      { id: "spiritual", label: "רוחני/ת", emoji: "🔮" },
    ],
  },
  {
    id: "education",
    label: "השכלה",
    single: true,
    traits: [
      { id: "high_school", label: "תיכונית", emoji: "🏫" },
      { id: "student", label: "סטודנט/ית", emoji: "🎒" },
      { id: "bachelor", label: "תואר ראשון", emoji: "🎓" },
      { id: "master", label: "תואר שני", emoji: "📘" },
      { id: "phd", label: "דוקטורט", emoji: "🔬" },
      { id: "vocational", label: "השכלה מקצועית", emoji: "🛠️" },
    ],
  },
];

export const ALL_TRAITS: Trait[] = TRAIT_GROUPS.flatMap((g) => g.traits);
const traitById = new Map(ALL_TRAITS.map((t) => [t.id, t]));
const groupByTrait = new Map(TRAIT_GROUPS.flatMap((g) => g.traits.map((t) => [t.id, g] as const)));

export function getTrait(id: string): Trait | undefined {
  return traitById.get(id);
}

/** Toggle a trait, respecting single-choice groups. */
export function toggleTrait(current: string[], id: string): string[] {
  if (current.includes(id)) return current.filter((t) => t !== id);
  const group = groupByTrait.get(id);
  const next = group?.single ? current.filter((t) => groupByTrait.get(t)?.id !== group.id) : current;
  return [...next, id];
}
