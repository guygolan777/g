import { useNavigate } from "@tanstack/react-router";
import { CalendarPlus, Camera, Users } from "lucide-react";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** "מה יוצרים היום?" — event, story or community. Shared by the bottom nav and the desktop sidebar. */
export function QuickCreateSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent title="מה יוצרים היום?">
        <div className="grid grid-cols-3 gap-3">
          {[
            { to: "/event/new", label: "אירוע", Icon: CalendarPlus, cls: "bg-event-soft text-event" },
            { to: "/story/new", label: "סטורי", Icon: Camera, cls: "bg-like-soft text-like" },
            { to: "/community/new", label: "קהילה", Icon: Users, cls: "bg-teal-soft text-teal" },
          ].map(({ to, label, Icon, cls }) => (
            <button
              key={to}
              onClick={() => {
                onOpenChange(false);
                void navigate({ to });
              }}
              className="flex flex-col items-center gap-2 rounded-2xl bg-surface-soft p-4 font-semibold"
            >
              <span className={cn("grid size-12 place-items-center rounded-full", cls)}>
                <Icon className="size-6" />
              </span>
              {label}
            </button>
          ))}
        </div>
      </SheetContent>
    </Dialog>
  );
}
