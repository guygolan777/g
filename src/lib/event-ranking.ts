import { categoryOf } from "./hobby-categories";
import { distanceKm, type LatLng } from "./geo";
import { UNLIMITED_SEATS } from "./constants";
import type { EventRow, Gender, ParticipantStatus } from "./types";

/**
 * Weighted event ranking. Each criterion has an internal hierarchy and only
 * the HIGHEST tier reached in a criterion is counted.
 */

export type RankViewer = {
  id: string;
  hobbies: string[];
  gender?: Gender | null;
  age?: number | null;
  location?: LatLng | null;
};

export type RankContext = {
  me: RankViewer | null;
  following: Set<string>;
  followers: Set<string>;
  /** My participation status per event id. */
  myStatus: Map<string, ParticipantStatus>;
  /** Categories of events I attended before ("past taste"), with counts. */
  pastCategories: Map<string, number>;
  /** Approved participant count per event id (organizer included). */
  approvedCounts: Map<string, number>;
  /** Approved participant ids per event id (for "people I follow are going"). */
  attendees?: Map<string, string[]>;
  now?: number;
};

// ---------- tier tables (descending) ----------
export const PERSONAL_TIERS = {
  mine: 100,
  approved: 80,
  pending: 60,
  mutual: 45,
  iFollow: 35,
  followsMe: 20,
  none: 0,
} as const;

export const MATCH_TIERS = { exactSub: 40, category: 28, pastTaste: 15, none: 0 } as const;
export const OCCUPANCY_TIERS = { almostFull: 12, filling: 8, moving: 4, some: 0, empty: -8 } as const;

const DISTANCE_FULL_KM = 5;
const DISTANCE_ZERO_KM = 50;
const DISTANCE_MAX_BONUS = 20;
const NO_RELATION_PENALTY = -1000;

export type PersonalTier = keyof typeof PERSONAL_TIERS;
export type MatchTier = keyof typeof MATCH_TIERS;
export type OccupancyTier = keyof typeof OCCUPANCY_TIERS;

export type ScoreBreakdown = {
  personal: PersonalTier;
  match: MatchTier;
  occupancy: OccupancyTier;
  distanceKm: number | null;
  hoursUntil: number;
  total: number;
  related: boolean;
  interest: boolean;
};

export function personalTier(ev: EventRow, ctx: RankContext): PersonalTier {
  const me = ctx.me;
  if (!me) return "none";
  if (ev.organizer_id === me.id) return "mine";
  const st = ctx.myStatus.get(ev.id);
  if (st === "approved") return "approved";
  if (st === "pending") return "pending";
  const org = ev.organizer_id ?? "";
  const iFollow = ctx.following.has(org);
  const followsMe = ctx.followers.has(org);
  if (iFollow && followsMe) return "mutual";
  const attendees = ctx.attendees?.get(ev.id) ?? [];
  if (iFollow || attendees.some((a) => a !== me.id && ctx.following.has(a))) return "iFollow";
  if (followsMe) return "followsMe";
  return "none";
}

export function matchTier(ev: EventRow, ctx: RankContext): MatchTier {
  const hobbies = ctx.me?.hobbies ?? [];
  if (ev.subcategory && hobbies.includes(ev.subcategory)) return "exactSub";
  if (hobbies.some((h) => categoryOf(h) === ev.category)) return "category";
  if ((ctx.pastCategories.get(ev.category) ?? 0) > 0) return "pastTaste";
  return "none";
}

export function occupancyTier(ev: EventRow, ctx: RankContext): OccupancyTier {
  const approved = Math.max(1, ctx.approvedCounts.get(ev.id) ?? 1);
  const seats = ev.seats ?? UNLIMITED_SEATS;
  if (approved <= 1) return "empty";
  if (seats < UNLIMITED_SEATS) {
    const ratio = approved / seats;
    if (ratio >= 0.85) return "almostFull";
    if (ratio >= 0.5) return "filling";
  } else {
    if (approved >= 30) return "almostFull";
    if (approved >= 12) return "filling";
  }
  return approved >= 2 ? "moving" : "some";
}

function urgencyScore(hoursUntil: number): number {
  if (hoursUntil < 0) return 0;
  if (hoursUntil <= 24) return 25; // today / next hours — highest
  if (hoursUntil <= 48) return 18;
  if (hoursUntil <= 24 * 7) return 10;
  return 3;
}

function lastSeatsBonus(ev: EventRow, ctx: RankContext): number {
  const seats = ev.seats ?? UNLIMITED_SEATS;
  if (seats >= UNLIMITED_SEATS) return 0;
  const left = seats - Math.max(1, ctx.approvedCounts.get(ev.id) ?? 1);
  return left > 0 && left <= 3 ? 12 : 0;
}

function distanceBonus(km: number | null): number {
  if (km == null) return 0;
  if (km <= DISTANCE_FULL_KM) return DISTANCE_MAX_BONUS;
  if (km >= DISTANCE_ZERO_KM) return 0;
  return DISTANCE_MAX_BONUS * (1 - (km - DISTANCE_FULL_KM) / (DISTANCE_ZERO_KM - DISTANCE_FULL_KM));
}

function audienceScore(ev: EventRow, ctx: RankContext): number {
  const me = ctx.me;
  if (!me) return 0;
  let s = 0;
  if (ev.gender_target && ev.gender_target !== "all") {
    s += me.gender === ev.gender_target ? 5 : -200;
  }
  if (me.age != null && (ev.min_age != null || ev.max_age != null)) {
    const ok = (ev.min_age == null || me.age >= ev.min_age) && (ev.max_age == null || me.age <= ev.max_age);
    s += ok ? 8 : -200;
  }
  return s;
}

export function eventDistance(ev: EventRow, loc: LatLng | null | undefined): number | null {
  if (!loc || ev.is_online || ev.lat == null || ev.lng == null) return null;
  return distanceKm(loc, { lat: ev.lat, lng: ev.lng });
}

export function scoreEvent(ev: EventRow, ctx: RankContext): ScoreBreakdown {
  const now = ctx.now ?? Date.now();
  const personal = personalTier(ev, ctx);
  const match = matchTier(ev, ctx);
  const occupancy = occupancyTier(ev, ctx);
  const dist = eventDistance(ev, ctx.me?.location);
  const hoursUntil = (new Date(ev.starts_at).getTime() - now) / 3_600_000;

  const related = personal !== "none" || match !== "none";
  const interest = match === "exactSub" || match === "category" || personal === "mutual" || personal === "iFollow";

  let total =
    PERSONAL_TIERS[personal] +
    MATCH_TIERS[match] +
    distanceBonus(dist) +
    audienceScore(ev, ctx) +
    urgencyScore(hoursUntil) +
    lastSeatsBonus(ev, ctx) +
    OCCUPANCY_TIERS[occupancy];

  // Events with no connection at all always sink to the end.
  if (!related) total += NO_RELATION_PENALTY;

  return { personal, match, occupancy, distanceKm: dist, hoursUntil, total, related, interest };
}

export type SortMode = "recommended" | "time" | "distance";

export type Ranked<T extends EventRow = EventRow> = { event: T; score: ScoreBreakdown };

export function rankEvents<T extends EventRow>(events: T[], ctx: RankContext, mode: SortMode = "recommended"): Ranked<T>[] {
  const ranked = events.map((event) => ({ event, score: scoreEvent(event, ctx) }));
  const byTime = (a: Ranked<T>, b: Ranked<T>) =>
    new Date(a.event.starts_at).getTime() - new Date(b.event.starts_at).getTime();
  if (mode === "time") return ranked.sort(byTime);
  if (mode === "distance") {
    return ranked.sort((a, b) => {
      const da = a.score.distanceKm ?? Number.POSITIVE_INFINITY;
      const db = b.score.distanceKm ?? Number.POSITIVE_INFINITY;
      return da - db || byTime(a, b);
    });
  }
  return ranked.sort((a, b) => b.score.total - a.score.total || byTime(a, b));
}

export type HomeCarousels<T extends EventRow> = {
  recommended: T[];
  startingSoon: T[];
  fromFollowing: T[];
  nearby: T[];
  mine: T[];
};

/**
 * Build home carousels in order, never repeating an event across carousels.
 * "Recommended" holds only events from my interests or people I follow, and
 * never events I organize.
 */
export function buildHomeCarousels<T extends EventRow>(events: T[], ctx: RankContext, limit = 12): HomeCarousels<T> {
  const used = new Set<string>();
  const meId = ctx.me?.id;
  const ranked = rankEvents(events, ctx, "recommended");
  const take = (list: Ranked<T>[]) => {
    const out: T[] = [];
    for (const r of list) {
      if (out.length >= limit) break;
      if (used.has(r.event.id)) continue;
      used.add(r.event.id);
      out.push(r.event);
    }
    return out;
  };
  const notMine = (r: Ranked<T>) => r.event.organizer_id !== meId;

  const recommended = take(ranked.filter((r) => notMine(r) && r.score.interest));
  const startingSoon = take(
    rankEvents(events, ctx, "time").filter((r) => notMine(r) && r.score.hoursUntil >= 0 && r.score.hoursUntil <= 72),
  );
  const fromFollowing = take(ranked.filter((r) => notMine(r) && ctx.following.has(r.event.organizer_id ?? "")));
  const nearby = take(
    rankEvents(events, ctx, "distance").filter((r) => notMine(r) && r.score.distanceKm != null && r.score.distanceKm <= 25),
  );
  const mine = take(rankEvents(events, ctx, "time").filter((r) => !notMine(r)));
  return { recommended, startingSoon, fromFollowing, nearby, mine };
}
