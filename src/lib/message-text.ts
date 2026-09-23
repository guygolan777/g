import type { MessageKind } from "./types";

type MessageLike = { kind: MessageKind; body: string; sender_id: string };

/**
 * Human text for a message preview, phrased from the viewer's side:
 * my story reply → "הגבת לסטורי", theirs → "הגיב/ה לסטורי שלך".
 */
export function messagePreview(msg: MessageLike, myId: string | null | undefined): string {
  const mine = !!myId && msg.sender_id === myId;
  switch (msg.kind) {
    case "story_reply":
      return mine ? `הגבת לסטורי: ${msg.body}` : `הגיב/ה לסטורי שלך: ${msg.body}`;
    case "voice":
      return mine ? "🎤 שלחת הודעה קולית" : "🎤 הודעה קולית";
    case "image":
      return mine ? "📷 שלחת תמונה" : "📷 תמונה";
    case "system":
      return msg.body;
    case "date_invite":
      return mine ? `את/ה: ${msg.body}` : msg.body;
    default:
      return mine ? `את/ה: ${msg.body}` : msg.body;
  }
}

/** Label shown above a story-reply bubble inside a chat. */
export function storyReplyLabel(senderId: string, myId: string | null | undefined): string {
  return senderId === myId ? "הגבת לסטורי" : "הגיב/ה לסטורי שלך";
}
