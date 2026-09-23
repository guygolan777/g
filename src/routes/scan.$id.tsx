import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, XCircle, Camera } from "lucide-react";
import { CenteredSpinner, Page, PageHeader } from "@/components/app-shell";
import { RequireAuth } from "@/components/gates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { whoComesTitle } from "@/lib/event-title";
import { hapticTap } from "@/lib/native";
import { seo } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/scan/$id")({
  head: () => seo({ title: "סריקת כרטיסים", description: "סריקת כרטיסי QR בכניסה לאירוע — למארגנים בלבד." }),
  component: () => (
    <RequireAuth>
      <Scan />
    </RequireAuth>
  ),
});

type Result = { result: "ok" | "already" | "not_approved" | "wrong_event" | "invalid" | "forbidden"; name?: string };

const RESULT_UI: Record<Result["result"], { text: string; cls: string; Icon: typeof CheckCircle2 }> = {
  ok: { text: "נכנס/ה בהצלחה", cls: "bg-success-soft text-success", Icon: CheckCircle2 },
  already: { text: "הכרטיס כבר נסרק — כניסה כפולה", cls: "bg-partner-soft text-partner-strong", Icon: AlertTriangle },
  not_approved: { text: "ההרשמה לא אושרה", cls: "bg-destructive-soft text-destructive", Icon: XCircle },
  wrong_event: { text: "הכרטיס שייך לאירוע אחר", cls: "bg-destructive-soft text-destructive", Icon: XCircle },
  invalid: { text: "כרטיס לא תקין", cls: "bg-destructive-soft text-destructive", Icon: XCircle },
  forbidden: { text: "רק המארגן/ת יכול/ה לסרוק", cls: "bg-destructive-soft text-destructive", Icon: XCircle },
};

type Detector = { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };

function Scan() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = React.useState(false);
  const [manual, setManual] = React.useState("");
  const [last, setLast] = React.useState<Result | null>(null);
  const [checkedIn, setCheckedIn] = React.useState(0);
  const busy = React.useRef(false);
  const lastCode = React.useRef<string>("");

  const ev = useQuery({
    queryKey: ["scan-event", id],
    queryFn: async () => {
      const { data } = await supabase.from("events").select("id, title, organizer_id").eq("id", id).maybeSingle();
      const { count } = await supabase.from("event_checkins").select("profile_id", { count: "exact", head: true }).eq("event_id", id);
      setCheckedIn(count ?? 0);
      return data as { id: string; title: string; organizer_id: string } | null;
    },
  });

  const verify = React.useCallback(
    async (raw: string) => {
      const code = raw.startsWith("mibale:ticket:") ? raw.split(":")[3] : raw.trim().replace(/\s/g, "").toLowerCase();
      const eventInCode = raw.startsWith("mibale:ticket:") ? raw.split(":")[2] : id;
      if (busy.current || !code || code === lastCode.current) return;
      busy.current = true;
      lastCode.current = code;
      let res: Result;
      if (eventInCode !== id) res = { result: "wrong_event" };
      else {
        const { data, error } = await supabase.rpc("check_in", { _event_id: id, _code: code });
        res = error ? { result: "invalid" } : (data as Result);
      }
      setLast(res);
      if (res.result === "ok") setCheckedIn((n) => n + 1);
      void hapticTap(res.result === "ok" ? "success" : "light");
      busy.current = false;
      window.setTimeout(() => (lastCode.current = ""), 3000);
    },
    [id],
  );

  React.useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        if (!BD) return;
        const detector = new BD({ formats: ["qr_code"] });
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes[0]) await verify(codes[0].rawValue);
          } catch {
            /* frame not ready */
          }
          raf = requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch {
        setScanning(false);
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [scanning, verify]);

  if (ev.isLoading) return <CenteredSpinner />;
  if (!ev.data || ev.data.organizer_id !== user?.id) {
    return (
      <Page withNav={false} size="narrow">
        <PageHeader title="סריקת כרטיסים" back />
        <p className="text-muted-foreground">מסך הסריקה זמין למארגן/ת האירוע בלבד.</p>
      </Page>
    );
  }

  const ui = last ? RESULT_UI[last.result] : null;
  return (
    <Page withNav={false} size="narrow">
      <PageHeader title="סריקת כרטיסים" subtitle={whoComesTitle(ev.data.title)} back />
      <div className="relative aspect-square overflow-hidden rounded-3xl bg-foreground">
        <video ref={videoRef} playsInline muted className={cn("size-full object-cover", !scanning && "hidden")} />
        {!scanning && (
          <button onClick={() => setScanning(true)} className="absolute inset-0 grid place-items-center text-background">
            <span className="flex flex-col items-center gap-2 font-semibold">
              <Camera className="size-10" />
              הפעלת מצלמה
            </span>
          </button>
        )}
        {scanning && <div className="pointer-events-none absolute inset-10 rounded-3xl border-4 border-primary/80" />}
      </div>
      {ui && last && (
        <div className={cn("mt-4 flex items-center gap-3 rounded-2xl p-4 font-bold", ui.cls)}>
          <ui.Icon className="size-7 shrink-0" />
          <div>
            <p>{ui.text}</p>
            {last.name && <p className="text-sm font-normal">{last.name}</p>}
          </div>
        </div>
      )}
      <p className="mt-4 text-center text-sm text-muted-foreground">נכנסו עד עכשיו: {checkedIn}</p>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          lastCode.current = "";
          void verify(manual);
          setManual("");
        }}
      >
        <Input dir="ltr" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="הזנת קוד ידנית" />
        <Button type="submit">בדיקה</Button>
      </form>
    </Page>
  );
}
