import * as React from "react";
import { toast } from "sonner";
import { Flag } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogTrigger, SheetContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Chip } from "@/components/chip";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { invalidateBlocked } from "@/lib/blocks";
import { writeError } from "@/lib/write-error";
import type { Report } from "@/lib/types";

const REASONS = ["הטרדה", "הטרדה מינית", "תוכן לא הולם", "ספאם", "התחזות", "הונאה", "אלימות או איומים", "נראה/ית מתחת לגיל 18", "אחר"];

export function ReportDialog({
  targetType,
  targetId,
  trigger,
  blockUser,
}: {
  targetType: Report["target_type"];
  targetId: string;
  trigger?: React.ReactNode;
  /** Offer to block this person in the same step. */
  blockUser?: { id: string; name: string };
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [details, setDetails] = React.useState("");
  const [block, setBlock] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  if (!user || blockUser?.id === user.id) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm">
            <Flag />
            דיווח
          </Button>
        )}
      </DialogTrigger>
      <SheetContent title="דיווח" description="הדיווח אנונימי — נשלח לצוות mibale בלבד, והמדווח/ת לא יודע/ת מי דיווח.">
        <div className="flex flex-wrap gap-2">
          {REASONS.map((r) => (
            <Chip key={r} active={reason === r} onClick={() => setReason(r)}>
              {r}
            </Chip>
          ))}
        </div>
        <Textarea className="mt-3" value={details} onChange={(e) => setDetails(e.target.value)} placeholder="פרטים נוספים (לא חובה)" maxLength={1000} />
        {blockUser && (
          <label className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-muted/60 p-3 text-sm">
            <span>
              לחסום גם את {blockUser.name}
              <span className="block text-xs text-muted-foreground">לא תראו אחד את השני ולא תוכלו לשלוח הודעות</span>
            </span>
            <Switch checked={block} onCheckedChange={setBlock} aria-label="לחסום גם" />
          </label>
        )}
        <p className="mt-3 text-xs text-muted-foreground">בסכנה מיידית? התקשרו למשטרה 100.</p>
        <Button
          className="mt-3 w-full"
          variant="destructive"
          disabled={!reason || busy}
          onClick={async () => {
            setBusy(true);
            const { error } = await supabase
              .from("reports")
              .insert({ reporter_id: user.id, target_type: targetType, target_id: targetId, reason, details: details.trim() });
            // already reported and still open → nothing new to send, but the block below still applies
            const duplicate = error?.code === "23505";
            if (error && !duplicate) {
              setBusy(false);
              return void toast.error(writeError(error, "שליחת הדיווח נכשלה"));
            }
            if (blockUser && block) {
              const { error: blockError } = await supabase.from("blocks").insert({ blocker_id: user.id, blocked_id: blockUser.id });
              if (!blockError || blockError.code === "23505") {
                invalidateBlocked();
                void qc.invalidateQueries();
              }
            }
            setBusy(false);
            toast.success(duplicate ? "כבר דיווחת על זה — הצוות בודק" : "תודה, הדיווח התקבל והצוות יבדוק אותו");
            setOpen(false);
            setReason("");
            setDetails("");
          }}
        >
          שליחת דיווח
        </Button>
      </SheetContent>
    </Dialog>
  );
}
