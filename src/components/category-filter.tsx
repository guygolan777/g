import * as React from "react";
import { Chip, ChipRow } from "@/components/chip";
import { HOBBY_CATEGORIES } from "@/lib/hobby-categories";

const STORAGE_KEY = "mibale-category-filter";

/** Multi-select category row (text only, one line, no icons) with a remembered selection. */
export function useCategoryFilter(scope = "home") {
  const key = `${STORAGE_KEY}:${scope}`;
  const [selected, setSelected] = React.useState<string[]>([]);
  React.useEffect(() => {
    try {
      setSelected(JSON.parse(localStorage.getItem(key) ?? "[]") as string[]);
    } catch {
      /* ignore */
    }
  }, [key]);
  const update = React.useCallback(
    (next: string[]) => {
      setSelected(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [key],
  );
  return [selected, update] as const;
}

export function CategoryFilterRow({ selected, onChange }: { selected: string[]; onChange: (next: string[]) => void }) {
  return (
    <ChipRow>
      <Chip active={selected.length === 0} onClick={() => onChange([])}>
        הכל
      </Chip>
      {HOBBY_CATEGORIES.map((c) => {
        const active = selected.includes(c.id);
        return (
          <Chip
            key={c.id}
            active={active}
            onClick={() => onChange(active ? selected.filter((s) => s !== c.id) : [...selected, c.id])}
          >
            {c.label}
          </Chip>
        );
      })}
    </ChipRow>
  );
}

export function matchesCategories(category: string | null | undefined, selected: string[]): boolean {
  if (!selected.length) return true;
  return !!category && selected.includes(category.split(".")[0]);
}
