import * as React from "react";
import { SafeImg } from "@/components/safe-img";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImagePlus } from "lucide-react";
import { Page, PageHeader } from "@/components/app-shell";
import { RequireAuth } from "@/components/gates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { uploadMedia } from "@/lib/storage";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/story/new")({
  validateSearch: (s: Record<string, unknown>): { romantic?: "1" } => ({ romantic: String(s.romantic) === "1" ? "1" : undefined }),
  // Outside the dating area every story is an event — creating one means creating an event.
  beforeLoad: ({ search }) => {
    if (search.romantic !== "1") throw redirect({ to: "/event/new", replace: true });
  },
  head: () => seo({ title: "סטורי רומנטי", description: "שתפו תמונה או סרטון בסטורי הרומנטי — גלוי רק במצב היכרויות." }),
  component: () => (
    <RequireAuth>
      <NewStory />
    </RequireAuth>
  ),
});

function NewStory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [caption, setCaption] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const isVideo = file?.type.startsWith("video/");

  async function publish() {
    if (!file || !user) return void toast.error("בחרו תמונה או סרטון");
    setBusy(true);
    try {
      const url = await uploadMedia(user.id, file, "stories");
      const { error } = await supabase.from("stories").insert({
        author_id: user.id,
        media_url: url,
        media_type: isVideo ? "video" : "image",
        caption: caption.trim(),
        is_romantic: true,
      });
      if (error) throw error;
      toast.success("הסטורי פורסם ✨");
      void qc.invalidateQueries({ queryKey: ["stories"] });
      void navigate({ to: "/likes", replace: true });
    } catch {
      toast.error("הפרסום נכשל");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page withNav={false} size="narrow">
      <PageHeader title="סטורי רומנטי" subtitle="גלוי רק למי שמצב ההיכרויות שלו פתוח" back />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="relative mx-auto grid aspect-[9/16] w-full max-w-xs place-items-center overflow-hidden rounded-3xl border-2 border-dashed border-border bg-surface-soft"
      >
        {preview ? (
          isVideo ? (
            <video src={preview} muted autoPlay loop playsInline className="absolute inset-0 size-full object-cover" />
          ) : (
            <SafeImg src={preview} alt="" className="absolute inset-0 size-full object-cover" />
          )
        ) : (
          <span className="flex flex-col items-center gap-2 text-muted-foreground">
            <ImagePlus className="size-8" /> תמונה או סרטון
          </span>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          setFile(f);
          setPreview(f ? URL.createObjectURL(f) : null);
        }}
      />
      <div className="mt-5 space-y-4">
        <Field label="כיתוב">
          <Input value={caption} maxLength={120} onChange={(e) => setCaption(e.target.value)} />
        </Field>
        <Button variant="brand" size="lg" className="w-full" disabled={busy || !file} onClick={() => void publish()}>
          {busy ? "מפרסמים…" : "פרסום"}
        </Button>
      </div>
    </Page>
  );
}
