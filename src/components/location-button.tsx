import * as React from "react";
import { toast } from "sonner";
import { LocateFixed, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, SheetContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useMyLocation } from "@/hooks/use-event-feed";
import { useSetLocationByName, useUpdateLocation } from "@/lib/location";
import { cn } from "@/lib/utils";

/**
 * Header location chip: shows my current city; tapping it lets me refresh from GPS or pick another place.
 * Only I see the position — others only ever get a rounded distance.
 */
export function LocationButton({ className }: { className?: string }) {
  const loc = useMyLocation();
  const update = useUpdateLocation();
  const setByName = useSetLocationByName();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<"gps" | "name" | null>(null);
  const [place, setPlace] = React.useState("");
  const city = loc.data?.city;

  async function gps() {
    setBusy("gps");
    const ok = await update();
    setBusy(null);
    if (!ok) return void toast.error("לא הצלחנו לאתר מיקום — בדקו שהמיקום מופעל ושאישרתם גישה");
    const { data } = await loc.refetch();
    toast.success(data?.city ? `המיקום עודכן: ${data.city} 📍` : "המיקום עודכן 📍");
    setOpen(false);
  }

  async function byName(e: React.FormEvent) {
    e.preventDefault();
    if (!place.trim()) return;
    setBusy("name");
    const found = await setByName(place.trim());
    setBusy(null);
    if (!found) return void toast.error("לא מצאנו את המקום — נסו שם עיר");
    toast.success(`המיקום עודכן: ${found} 📍`);
    setPlace("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={city ? `המיקום שלי: ${city}` : "הגדרת מיקום"}
          className={cn("flex max-w-28 shrink-0 flex-col items-center gap-0.5 text-primary", className)}
        >
          <span className="grid size-11 place-items-center rounded-full bg-primary-soft">
            <MapPin className="size-5" />
          </span>
          <span className="w-full truncate text-center text-xs font-semibold">{city ?? "מיקום"}</span>
        </button>
      </DialogTrigger>
      <SheetContent title="המיקום שלי" description="משמש לחישוב מרחק בלבד — אחרים רואים רק מרחק מעוגל, לא את המיקום.">
        <p className="rounded-2xl bg-surface-soft p-3">
          {city ? (
            <>
              📍 אתם כרגע ב<b>{city}</b>
            </>
          ) : (
            "עוד לא הוגדר מיקום"
          )}
        </p>
        <Button variant="brand" size="lg" className="mt-4 w-full" disabled={!!busy} onClick={() => void gps()}>
          <LocateFixed className={busy === "gps" ? "animate-spin" : undefined} /> {busy === "gps" ? "מאתרים…" : "עדכון לפי המיקום הנוכחי"}
        </Button>
        <form onSubmit={byName} className="mt-4">
          <p className="mb-2 text-sm font-semibold text-muted-foreground">או בחירת מקום אחר</p>
          <div className="flex gap-2">
            <Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="לדוגמה: חיפה" className="min-w-0 flex-1" />
            <Button type="submit" variant="outline" disabled={!!busy || !place.trim()}>
              {busy === "name" ? "…" : "עדכון"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Dialog>
  );
}
