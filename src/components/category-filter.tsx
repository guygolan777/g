import * as React from "react";
import { ChipRow } from "@/components/chip";
import { HOBBY_CATEGORIES, hobbyToneClass } from "@/lib/hobby-categories";
import { cn } from "@/lib/utils";

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

/** One-line row of colored category chips (text only) with multi-select. */
export function CategoryFilterRow({ selected, onChange }: { selected: string[]; onChange: (next: string[]) => void }) {
  return (
    <ChipRow>
      {HOBBY_CATEGORIES.map((c) => {
        const active = selected.includes(c.id);
        return (
          <button
            key={c.id}
            onClick={() => onChange(active ? selected.filter((s) => s !== c.id) : [...selected, c.id])}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition active:scale-95",
              active ? "bg-primary text-primary-foreground" : hobbyToneClass(c.id),
            )}
          >
            {c.label}
          </button>
        );
      })}
    </ChipRow>
  );
}

export function matchesCategories(category: string | null | undefined, selected: string[]): boolean {
  if (!selected.length) return true;
  return !!category && selected.includes(category.split(".")[0]);
}
