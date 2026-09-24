import * as React from "react";
import { CheckCircle2, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useMyLocation } from "@/hooks/use-event-feed";
import { PLACES_PROVIDER, resolvePlace, suggestPlaces, type PlacePick, type PlaceSuggestion } from "@/lib/places";
import { cn } from "@/lib/utils";

/**
 * Place / address field with suggestions from a real map, so an event gets exact coordinates.
 * Typing still works (the text is geocoded on save), but picking a suggestion is what "verifies" it.
 */
export function AddressInput({
  value,
  verified,
  onChange,
  onPick,
  placeholder,
  className,
}: {
  value: string;
  verified: boolean;
  onChange: (text: string) => void;
  onPick: (place: PlacePick) => void;
  placeholder?: string;
  className?: string;
}) {
  const near = useMyLocation().data;
  const [items, setItems] = React.useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const typed = React.useRef(false);
  const listId = React.useId();

  React.useEffect(() => {
    if (!typed.current) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      suggestPlaces(value, near, ctrl.signal)
        .then((s) => {
          setItems(s);
          setActive(0);
          setOpen(s.length > 0);
        })
        .catch(() => setItems([]));
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value, near]);

  async function pick(s: PlaceSuggestion) {
    typed.current = false;
    setOpen(false);
    setItems([]);
    const place = await resolvePlace(s);
    if (place) onPick(place);
  }

  return (
    <div className="relative">
      <Input
        value={value}
        placeholder={placeholder}
        className={cn(verified && "pe-10", className)}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        onChange={(e) => {
          typed.current = true;
          onChange(e.target.value);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => items.length > 0 && setOpen(true)}
        onKeyDown={(e) => {
          if (!open || !items.length) return;
          if (e.key === "ArrowDown") (e.preventDefault(), setActive((i) => (i + 1) % items.length));
          else if (e.key === "ArrowUp") (e.preventDefault(), setActive((i) => (i - 1 + items.length) % items.length));
          else if (e.key === "Enter") (e.preventDefault(), void pick(items[active]));
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {verified && <CheckCircle2 className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-success" aria-label="מיקום מאומת" />}
      {open && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-2xl bg-popover shadow-lift">
          {items.map((s, i) => (
            <li
              key={s.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void pick(s)}
              className={cn("flex cursor-pointer items-center gap-3 px-4 py-2.5", i === active && "bg-muted")}
            >
              <MapPin className="size-4 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{s.main}</span>
                {s.secondary && <span className="block truncate text-xs text-muted-foreground">{s.secondary}</span>}
              </span>
            </li>
          ))}
          {PLACES_PROVIDER === "google" && <li className="px-4 py-1 text-end text-[10px] text-muted-foreground">Google</li>}
        </ul>
      )}
    </div>
  );
}
