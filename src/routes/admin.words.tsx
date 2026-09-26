import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Chip } from "@/components/chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { seo } from "@/lib/seo";
import { moderation, moderationError } from "@/lib/admin";

export const Route = createFileRoute("/admin/words")({
  head: () => seo({ title: "ניהול · סינון מילים", description: "מילים שמסמנות תוכן לבדיקה או חוסמות אותו." }),
  component: Words,
});

type Word = { word: string; action: "flag" | "block"; created_at: string };

function Words() {
  const qc = useQueryClient();
  const [word, setWord] = React.useState("");
  const [action, setAction] = React.useState<"flag" | "block">("flag");
  const words = useQuery({
    queryKey: ["admin-words"],
    queryFn: async () => {
      const { data } = await supabase.from("moderation_words").select("word, action, created_at").order("created_at", { ascending: false });
      return (data ?? []) as Word[];
    },
  });
  const save = async (w: string, a: "flag" | "block" | null) => {
    try {
      await moderation.setWord(w, a);
      void qc.invalidateQueries({ queryKey: ["admin-words"] });
      return true;
    } catch (e) {
      toast.error(moderationError(e));
      return false;
    }
  };
  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">
        המילים נבדקות בהודעות, תגובות, סטוריז, אירועים, קהילות ופרופילים. <b>סימון לבדיקה</b> — התוכן עולה ונכנס לתור הדיווחים.{" "}
        <b>חסימה</b> — התוכן לא יישלח בכלל.
      </p>
      <form
        className="mb-4 flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const w = word.trim().toLowerCase();
          if (w.length < 2) return void toast.error("לפחות 2 תווים");
          if (await save(w, action)) {
            setWord("");
            toast.success("נוסף");
          }
        }}
      >
        <Input value={word} onChange={(e) => setWord(e.target.value)} placeholder="מילה או ביטוי" aria-label="מילה או ביטוי" className="min-w-40 flex-1" maxLength={60} />
        <Chip active={action === "flag"} onClick={() => setAction("flag")}>
          סימון לבדיקה
        </Chip>
        <Chip active={action === "block"} onClick={() => setAction("block")}>
          חסימה
        </Chip>
        <Button type="submit" size="sm">
          הוספה
        </Button>
      </form>
      {words.data?.length === 0 && <p className="text-sm text-muted-foreground">עוד אין מילים ברשימה</p>}
      <div className="space-y-2">
        {words.data?.map((w) => (
          <div key={w.word} className="flex items-center gap-2 rounded-2xl bg-card p-3 shadow-soft">
            <span className="flex-1 font-semibold">{w.word}</span>
            <button type="button" onClick={() => void save(w.word, w.action === "flag" ? "block" : "flag")} aria-label="החלפת סוג">
              <Badge variant={w.action === "block" ? "destructive" : "violet"}>{w.action === "block" ? "חסימה" : "סימון לבדיקה"}</Badge>
            </button>
            <Button size="icon-sm" variant="ghost" aria-label={`הסרת ${w.word}`} onClick={() => void save(w.word, null)}>
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
