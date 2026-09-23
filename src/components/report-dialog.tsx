import * as React from "react";
import { toast } from "sonner";
import { Flag } from "lucide-react";
import { Dialog, DialogTrigger, SheetContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Chip } from "@/components/chip";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import type { Report } from "@/lib/types";

const REASONS = ["ספאם", "התנהגות פוגענית", "תוכן לא הולם", "התחזות", "הונאה", "אחר"];

export function ReportDialog({
  targetType,
  targetId,
  trigger,
}: {
  targetType: Report["target_type"];
  targetId: string;
  trigger?: React.ReactNode;
}) {
  const { user } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [details, setDetails] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  if (!user) return null;
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
      <SheetContent title="דיווח" description="הדיווח נשלח לצוות mibale בלבד ולא יוצג לאף אחד אחר.">
        <div className="flex flex-wrap gap-2">
          {REASONS.map((r) => (
            <Chip key={r} active={reason === r} onClick={() => setReason(r)}>
              {r}
            </Chip>
          ))}
        </div>
        <Textarea className="mt-3" value={details} onChange={(e) => setDetails(e.target.value)} placeholder="פרטים נוספים (לא חובה)" />
        <Button
          className="mt-4 w-full"
          variant="destructive"
          disabled={!reason || busy}
          onClick={async () => {
            setBusy(true);
            const { error } = await supabase
              .from("reports")
              .insert({ reporter_id: user.id, target_type: targetType, target_id: targetId, reason, details });
            setBusy(false);
            if (error) return void toast.error("שליחת הדיווח נכשלה");
            toast.success("תודה, הדיווח התקבל");
            setOpen(false);
          }}
        >
          שליחת דיווח
        </Button>
      </SheetContent>
    </Dialog>
  );
}
