import * as React from "react";
import { SafeImg } from "@/components/safe-img";
import { Link } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/avatar";
import { VoiceRecorder } from "@/components/voice-recorder";
import { useAuth } from "@/hooks/use-auth";
import { formatTime } from "@/lib/format";
import { storyReplyLabel } from "@/lib/message-text";
import { uploadMedia } from "@/lib/storage";
import type { MessageKind, Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ThreadMessage = {
  id: string;
  sender_id: string;
  kind: MessageKind;
  body: string;
  media_url: string | null;
  created_at: string;
  story_id?: string | null;
};

export function ChatThread({
  messages,
  senders,
  showSenders,
  onSend,
  disabled,
  disabledText,
}: {
  messages: ThreadMessage[];
  senders: Map<string, Pick<Profile, "id" | "name" | "avatar_url">>;
  showSenders: boolean;
  onSend: (msg: { kind: MessageKind; body: string; media_url?: string | null }) => Promise<boolean>;
  disabled?: boolean;
  disabledText?: string;
}) {
  const { user } = useAuth();
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const bottom = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    setSending(true);
    const ok = await onSend({ kind: "text", body });
    setSending(false);
    if (ok) setText("");
  }

  async function sendVoice(blob: Blob) {
    if (!user) return;
    setSending(true);
    try {
      const url = await uploadMedia(user.id, blob, "voice", blob.type.includes("mp4") ? "m4a" : "webm");
      await onSend({ kind: "voice", body: "", media_url: url });
    } catch {
      toast.error("שליחת ההקלטה נכשלה");
    } finally {
      setSending(false);
    }
  }

  let lastDay = "";
  return (
    <div className="flex min-h-[calc(100dvh-4.5rem)] flex-col">
      <div className="flex-1 space-y-1.5 pb-4">
        {messages.map((m, i) => {
          const mine = m.sender_id === user?.id;
          const sender = senders.get(m.sender_id);
          const day = new Date(m.created_at).toDateString();
          const showDay = day !== lastDay;
          lastDay = day;
          const firstOfRun = i === 0 || messages[i - 1].sender_id !== m.sender_id || showDay;
          return (
            <React.Fragment key={m.id}>
              {showDay && (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long" }).format(new Date(m.created_at))}
                </p>
              )}
              <div className={cn("flex items-end gap-2", mine ? "justify-start" : "justify-end flex-row-reverse")}>
                {!mine && showSenders && (
                  <div className="w-7">{firstOfRun && <Avatar src={sender?.avatar_url} name={sender?.name} size={28} />}</div>
                )}
                <div
                  className={cn(
                    "max-w-[78%] rounded-2xl px-3.5 py-2 text-[15px]",
                    mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-surface shadow-soft",
                  )}
                >
                  {!mine && showSenders && firstOfRun && <p className="mb-0.5 text-xs font-bold text-primary">{sender?.name}</p>}
                  {m.kind === "story_reply" && (
                    <p className={cn("mb-1 text-xs", mine ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {m.story_id ? (
                        <Link to="/story/$id" params={{ id: m.story_id }} className="underline">
                          {storyReplyLabel(m.sender_id, user?.id)}
                        </Link>
                      ) : (
                        storyReplyLabel(m.sender_id, user?.id)
                      )}
                    </p>
                  )}
                  {m.kind === "voice" && m.media_url ? (
                    <audio src={m.media_url} controls preload="none" className="h-9 max-w-56" />
                  ) : m.kind === "image" && m.media_url ? (
                    <SafeImg src={m.media_url} alt="" className="max-h-64 rounded-xl" />
                  ) : (
                    <p className="break-words whitespace-pre-wrap">{m.body}</p>
                  )}
                  <p className={cn("mt-0.5 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>{formatTime(m.created_at)}</p>
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <div ref={bottom} />
      </div>
      <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/95 px-4 py-2 pb-safe backdrop-blur">
        {disabled ? (
          <p className="py-2 text-center text-sm text-muted-foreground">{disabledText}</p>
        ) : (
          <form onSubmit={send} className="flex items-center gap-2">
            <VoiceRecorder onRecorded={(b) => void sendVoice(b)} disabled={sending} />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="הודעה…"
              className="h-11 flex-1 rounded-full border border-input bg-surface px-4 outline-none focus:border-ring"
            />
            <button type="submit" disabled={sending || !text.trim()} className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-50" aria-label="שליחה">
              <Send className="size-5 -scale-x-100" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
