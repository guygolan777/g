import * as React from "react";
import { SafeImg } from "@/components/safe-img";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, Eye, Heart, Send, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { CenteredSpinner } from "@/components/app-shell";
import { RequireAuth } from "@/components/gates";
import { Button } from "@/components/ui/button";
import { useActiveStories, type StoryWithAuthor } from "@/components/story-rail";
import { useJoinEvent } from "@/components/join-button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { channelName } from "@/lib/realtime";
import { whoComesTitle } from "@/lib/event-title";
import { formatDate, formatEventWhen, formatTime } from "@/lib/format";
import { formatRelative } from "@/lib/format";
import { hapticTap } from "@/lib/native";
import { seo } from "@/lib/seo";
import type { ParticipantStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/story/$id")({
  validateSearch: (s: Record<string, unknown>): { romantic?: "1" } => ({ romantic: s.romantic === "1" ? "1" : undefined }),
  head: () => seo({ title: "סטורי", description: "סטוריז מאנשים ואירועים ב-mibale." }),
  component: () => (
    <RequireAuth>
      <StoryViewer />
    </RequireAuth>
  ),
});

const IMAGE_MS = 5000;

function StoryViewer() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { romantic } = Route.useSearch();
  const { flat, isLoading } = useActiveStories(romantic === "1");
  const scroller = React.useRef<HTMLDivElement>(null);
  const [current, setCurrent] = React.useState(id);
  const [muted, setMuted] = React.useState(true);
  const [paused, setPaused] = React.useState(false);

  const index = flat.findIndex((s) => s.id === current);
  const close = React.useCallback(() => void navigate({ to: romantic === "1" ? "/likes" : "/home" }), [navigate, romantic]);

  const goTo = React.useCallback(
    (i: number) => {
      if (i < 0) return;
      if (i >= flat.length) return close();
      const el = scroller.current?.children[i] as HTMLElement | undefined;
      el?.scrollIntoView({ behavior: "smooth", inline: "center" });
    },
    [flat.length, close],
  );

  // Jump to the requested story once loaded.
  React.useEffect(() => {
    if (isLoading) return;
    const i = flat.findIndex((s) => s.id === id);
    const el = scroller.current?.children[Math.max(0, i)] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "instant" as ScrollBehavior, inline: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  // Track which slide is centered.
  React.useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setCurrent((e.target as HTMLElement).dataset.id!);
      },
      { root, threshold: 0.6 },
    );
    Array.from(root.children).forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [flat.length]);

  if (isLoading) return <CenteredSpinner />;
  if (!flat.length) {
    close();
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-foreground" dir="rtl">
      <div ref={scroller} className="flex size-full snap-x snap-mandatory overflow-x-auto scrollbar-none">
        {flat.map((s, i) => (
          <StorySlide
            key={s.id}
            story={s}
            active={s.id === current}
            muted={muted}
            paused={paused}
            onToggleMute={() => setMuted((m) => !m)}
            onPause={setPaused}
            onNext={() => goTo(i + 1)}
            onPrev={() => goTo(i - 1)}
            onClose={close}
            siblings={flat.filter((x) => x.author_id === s.author_id)}
          />
        ))}
      </div>
      {index < 0 && <div className="sr-only">טוען</div>}
    </div>
  );
}

function StorySlide({
  story,
  active,
  muted,
  paused,
  siblings,
  onToggleMute,
  onPause,
  onNext,
  onPrev,
  onClose,
}: {
  story: StoryWithAuthor;
  active: boolean;
  muted: boolean;
  paused: boolean;
  siblings: StoryWithAuthor[];
  onToggleMute: () => void;
  onPause: (p: boolean) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [progress, setProgress] = React.useState(0);
  const [reply, setReply] = React.useState("");
  const isMine = story.author_id === user?.id;
  const pos = siblings.findIndex((s) => s.id === story.id);

  // Mark as viewed.
  React.useEffect(() => {
    if (!active || !user || isMine) return;
    void supabase
      .from("story_views")
      .upsert({ story_id: story.id, viewer_id: user.id }, { onConflict: "story_id,viewer_id", ignoreDuplicates: true })
      .then(() => void qc.invalidateQueries({ queryKey: ["stories"] }));
  }, [active, story.id, user, isMine, qc]);

  // Videos start muted and only play while centered.
  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active && !paused) void v.play().catch(() => undefined);
    else v.pause();
    if (!active) v.currentTime = 0;
  }, [active, paused]);

  // Image timer / video progress → auto-advance.
  React.useEffect(() => {
    if (!active) return setProgress(0);
    if (story.media_type === "video") return;
    if (paused) return;
    const start = performance.now() - progress * IMAGE_MS;
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / IMAGE_MS);
      setProgress(p);
      if (p >= 1) onNext();
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, paused, story.media_type]);

  const likes = useQuery({
    queryKey: ["story-likes", story.id, user?.id],
    enabled: active,
    queryFn: async () => {
      const { data } = await supabase.from("story_likes").select("profile_id").eq("story_id", story.id);
      const rows = (data ?? []) as Array<{ profile_id: string }>;
      return { liked: rows.some((r) => r.profile_id === user?.id), count: rows.length };
    },
  });
  const views = useQuery({
    queryKey: ["story-views", story.id],
    enabled: active && isMine,
    queryFn: async () => {
      const { count } = await supabase.from("story_views").select("viewer_id", { count: "exact", head: true }).eq("story_id", story.id);
      return count ?? 0;
    },
  });

  async function toggleLike() {
    if (!user) return;
    const liked = likes.data?.liked;
    const { error } = liked
      ? await supabase.from("story_likes").delete().eq("story_id", story.id).eq("profile_id", user.id)
      : await supabase.from("story_likes").insert({ story_id: story.id, profile_id: user.id });
    if (error) return;
    if (!liked) void hapticTap();
    void qc.invalidateQueries({ queryKey: ["story-likes", story.id] });
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim() || !user) return;
    const { error } = await supabase.from("story_replies").insert({ story_id: story.id, author_id: user.id, body: reply.trim() });
    if (error) return void toast.error("השליחה נכשלה");
    setReply("");
    toast.success("התגובה נשלחה לצ׳אט");
  }

  async function remove() {
    if (!confirm("למחוק את הסטורי?")) return;
    await supabase.from("stories").delete().eq("id", story.id);
    void qc.invalidateQueries({ queryKey: ["stories"] });
    onNext();
  }

  return (
    <section data-id={story.id} className="relative size-full shrink-0 snap-center overflow-hidden bg-foreground">
      {!story.media_url ? (
        // Event story without a cover image: a light-blue backdrop; the caption and event card sit on top.
        <div className="absolute inset-0 grid place-items-center bg-gradient-ring-event">
          <span className="text-8xl drop-shadow-lg" aria-hidden>
            🎉
          </span>
        </div>
      ) : story.media_type === "video" ? (
        <video
          ref={videoRef}
          src={story.media_url}
          muted={muted}
          playsInline
          preload="metadata"
          className="absolute inset-0 size-full object-contain"
          onTimeUpdate={(e) => active && setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 1))}
          onEnded={() => active && onNext()}
        />
      ) : (
        <SafeImg src={story.media_url} alt="" className="absolute inset-0 size-full object-contain" />
      )}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-foreground/70 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-scrim" />

      {/* tap zones: right = previous (RTL), left = next */}
      <button className="absolute inset-y-24 right-0 w-1/3" aria-label="הקודם" onClick={onPrev} />
      <button
        className="absolute inset-y-24 left-0 w-2/3"
        aria-label="הבא"
        onClick={onNext}
        onPointerDown={() => onPause(true)}
        onPointerUp={() => onPause(false)}
        onPointerLeave={() => onPause(false)}
      />

      <div className="absolute inset-x-0 top-0 px-3 pt-safe">
        <div className="mt-2 flex gap-1" dir="rtl">
          {siblings.map((s, i) => (
            <span key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-scrim-foreground/30">
              <span
                className="block h-full bg-scrim-foreground"
                style={{ width: `${i < pos ? 100 : i === pos ? progress * 100 : 0}%` }}
              />
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 text-scrim-foreground">
          <Link to="/profile/$id" params={{ id: story.author_id }} className="flex items-center gap-2">
            <Avatar src={story.author?.avatar_url} name={story.author?.name} size={36} />
            <span className="font-semibold">{story.author?.name}</span>
          </Link>
          <span className="text-xs opacity-80">{formatRelative(story.created_at)}</span>
          <div className="ms-auto flex items-center gap-1">
            {story.media_type === "video" && (
              <button onClick={onToggleMute} className="grid size-9 place-items-center rounded-full" aria-label={muted ? "הפעלת קול" : "השתקה"}>
                {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
              </button>
            )}
            {isMine && (
              <button onClick={() => void remove()} className="grid size-9 place-items-center rounded-full" aria-label="מחיקה">
                <Trash2 className="size-5" />
              </button>
            )}
            <button onClick={onClose} className="grid size-9 place-items-center rounded-full" aria-label="סגירה">
              <X className="size-6" />
            </button>
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 space-y-3 px-4 pb-safe">
        {story.caption && <p className="text-center text-lg font-semibold text-scrim-foreground">{story.caption}</p>}
        {story.event_id && active && <StoryEventAction eventId={story.event_id} />}
        {isMine ? (
          <div className="flex items-center justify-center gap-4 pb-4 text-scrim-foreground">
            <span className="flex items-center gap-1">
              <Eye className="size-5" /> {views.data ?? 0}
            </span>
            <span className="flex items-center gap-1">
              <Heart className="size-5" /> {likes.data?.count ?? 0}
            </span>
          </div>
        ) : (
          <form onSubmit={sendReply} className="flex items-center gap-2 pb-4">
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onFocus={() => onPause(true)}
              onBlur={() => onPause(false)}
              placeholder="תגובה לסטורי…"
              className="h-11 flex-1 rounded-full border border-scrim-foreground/40 bg-transparent px-4 text-scrim-foreground outline-none placeholder:text-scrim-foreground/70"
            />
            {reply.trim() ? (
              <button type="submit" className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground" aria-label="שליחה">
                <Send className="size-5" />
              </button>
            ) : (
              <button type="button" onClick={() => void toggleLike()} className="grid size-11 place-items-center text-scrim-foreground" aria-label="לייק">
                <Heart className={cn("size-7", likes.data?.liked && "fill-like text-like")} />
              </button>
            )}
          </form>
        )}
      </div>
    </section>
  );
}

/**
 * Event story CTA with live status: join (gradient) → "ממתין" → "אתה בפנים — לפרטי האירוע".
 * A decline is never shown — it falls back to the join button.
 */
function StoryEventAction({ eventId }: { eventId: string }) {
  const { user } = useAuth();
  const { join, loading } = useJoinEvent();
  const [status, setStatus] = React.useState<ParticipantStatus | null>(null);
  const ev = useQuery({
    queryKey: ["story-event", eventId, user?.id],
    queryFn: async () => {
      const [{ data: e }, { data: p }] = await Promise.all([
        supabase.from("events").select("id, title, organizer_id, starts_at, city, is_online, price").eq("id", eventId).maybeSingle(),
        supabase.from("event_participants").select("status").eq("event_id", eventId).eq("profile_id", user!.id).maybeSingle(),
      ]);
      setStatus((p?.status as ParticipantStatus | undefined) ?? null);
      return e as {
        id: string;
        title: string;
        organizer_id: string;
        starts_at: string;
        city: string | null;
        is_online: boolean;
        price: number | null;
      } | null;
    },
  });

  // Realtime on my own participation row only.
  React.useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(channelName(`story-join-${eventId}-${user.id}`))
      .on("postgres_changes", { event: "*", schema: "public", table: "event_participants", filter: `profile_id=eq.${user.id}` }, (payload) => {
        const row = (payload.new ?? payload.old) as { event_id?: string; status?: ParticipantStatus };
        if (row?.event_id !== eventId) return;
        setStatus(payload.eventType === "DELETE" ? null : (row.status ?? null));
      })
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, [eventId, user]);

  if (!ev.data) return null;
  const isOrganizer = ev.data.organizer_id === user?.id;
  const shown = status === "declined" ? null : status;

  return (
    <div className="space-y-2 text-center">
      <StoryEventWhen event={ev.data} />
      {isOrganizer || shown === "approved" ? (
        <Button asChild variant="success" size="lg" className="w-full">
          <Link to="/e/$id" params={{ id: eventId }}>{isOrganizer ? "האירוע שלך — לניהול" : "אתה בפנים — לפרטי האירוע"}</Link>
        </Button>
      ) : shown === "pending" ? (
        <Button asChild variant="secondary" size="lg" className="w-full">
          <Link to="/e/$id" params={{ id: eventId }}>{ev.data.price ? "ממתין לתשלום ואישור — לפרטים" : "ממתין לאישור המארגן"}</Link>
        </Button>
      ) : (
        <Button
          variant="brand"
          size="lg"
          className="w-full"
          disabled={loading}
          onClick={async () => {
            const s = await join(eventId, ev.data?.price);
            if (s) setStatus(s);
          }}
        >
          {ev.data.price ? `הצטרפות · ₪${Number(ev.data.price).toLocaleString("he-IL")}` : "הצטרפות לאירוע"}
        </Button>
      )}
    </div>
  );
}

/** Event stories always say when: weekday, date and time (plus today/tomorrow), where, and the price. */
function StoryEventWhen({ event }: { event: { title: string; starts_at: string; city: string | null; is_online: boolean; price: number | null } }) {
  const weekday = formatDate(event.starts_at, { weekday: "long" });
  const date = formatDate(event.starts_at, { day: "numeric", month: "numeric" });
  const time = formatTime(event.starts_at);
  const rel = formatEventWhen(event.starts_at).split(" · ")[0];
  const relLabel = rel === "היום" || rel === "מחר" ? rel : null;
  return (
    <div className="rounded-2xl bg-overlay p-3 text-scrim-foreground backdrop-blur-md">
      <p className="truncate text-sm font-semibold opacity-90">{whoComesTitle(event.title)}</p>
      <p className="mt-1 flex items-center justify-center gap-2 text-xl font-extrabold">
        <CalendarDays className="size-5 shrink-0" />
        <span>
          {weekday} · {date} · {time}
        </span>
      </p>
      <p className="mt-1 text-sm opacity-90">
        {relLabel && <span className="me-1 rounded-full bg-like px-2 py-0.5 text-xs font-bold text-like-foreground">{relLabel}</span>}
        {event.is_online ? "אונליין" : (event.city ?? "")}
        {event.price ? ` · ₪${Number(event.price).toLocaleString("he-IL")}` : " · חינם"}
      </p>
    </div>
  );
}
