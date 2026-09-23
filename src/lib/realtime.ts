/**
 * Realtime channel topics must be unique per subscription: supabase.channel()
 * returns the existing channel for a known topic, and adding postgres_changes
 * callbacks to an already-subscribed channel throws.
 */
let seq = 0;
export function channelName(base: string): string {
  seq += 1;
  return `${base}:${seq}:${Math.random().toString(36).slice(2, 8)}`;
}
