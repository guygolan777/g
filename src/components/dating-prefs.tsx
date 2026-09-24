import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { DualSlider, Slider } from "@/components/ui/range";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import type { AudienceGender } from "@/lib/types";
import { cn } from "@/lib/utils";

export const DISTANCE_UNLIMITED = 200;
export const AGE_TOP = 99;

/** "העדפות רומנטיות" — private (pref_* columns are never visible to others). */
export function PrefsSheet({
  open,
  onOpenChange,
  enableDating = false,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** First time the heart is turned on: saving the preferences also opens dating mode. */
  enableDating?: boolean;
  onSaved?: () => void;
}) {
  const { user, settings, refreshProfile } = useAuth();
  const qc = useQueryClient();
  const [gender, setGender] = React.useState<AudienceGender>("all");
  const [ages, setAges] = React.useState<[number, number]>([18, AGE_TOP]);
  const [dist, setDist] = React.useState(DISTANCE_UNLIMITED);
  React.useEffect(() => {
    if (!settings || !open) return;
    setGender(settings.pref_gender);
    setAges([settings.pref_min_age, Math.min(AGE_TOP, settings.pref_max_age)]);
    setDist(Math.min(DISTANCE_UNLIMITED, settings.pref_distance_km));
  }, [settings, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={enableDating ? "💘 רגע לפני שפותחים את הלב" : "העדפות רומנטיות"}
        description={enableDating ? "את מי תרצו לפגוש? ההעדפות פרטיות ולא מוצגות לאף אחד" : "ההעדפות פרטיות ולא מוצגות לאף אחד"}
      >
        <div className="space-y-6">
          <div>
            <p className="mb-2 font-bold">מגדר</p>
            <div className="flex gap-2">
              {(
                [
                  ["all", "כולם"],
                  ["female", "נשים"],
                  ["male", "גברים"],
                ] as const
              ).map(([g, l]) => (
                <button
                  key={g}
                  onClick={() => setGender(g)}
                  className={cn("h-11 rounded-full px-6 font-semibold", gender === g ? "bg-like text-like-foreground" : "bg-surface-soft text-muted-foreground")}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 flex justify-between">
              <p className="font-bold">גילאים</p>
              <p className="text-muted-foreground">
                {ages[0]}–{ages[1] >= AGE_TOP ? `${AGE_TOP}+` : ages[1]}
              </p>
            </div>
            <DualSlider label="גילאים" min={18} max={AGE_TOP} value={ages} onChange={setAges} />
          </div>
          <div>
            <div className="mb-2 flex justify-between">
              <p className="font-bold">מרחק ממני</p>
              <p className="text-muted-foreground">{dist >= DISTANCE_UNLIMITED ? "ללא הגבלה" : `עד ${dist} ק״מ`}</p>
            </div>
            <Slider label="מרחק ממני" min={1} max={DISTANCE_UNLIMITED} value={dist} onChange={setDist} />
          </div>
          <Button
            className="w-full"
            variant="brand"
            size="lg"
            onClick={async () => {
              const { error } = await supabase
                .from("profiles")
                .update({
                  pref_gender: gender,
                  pref_min_age: ages[0],
                  pref_max_age: ages[1],
                  pref_distance_km: dist,
                  dating_prefs_at: new Date().toISOString(),
                  ...(enableDating ? { dating_enabled: true } : {}),
                })
                .eq("id", user!.id);
              if (error) return void toast.error("השמירה נכשלה");
              await refreshProfile();
              void qc.invalidateQueries({ queryKey: ["dating-candidates"] });
              onOpenChange(false);
              onSaved?.();
            }}
          >
            {enableDating ? "שמירה ופתיחת הלב" : "שמירת העדפות"}
          </Button>
        </div>
      </SheetContent>
    </Dialog>
  );
}
