import { describe, expect, it } from "vitest";
import { buildHomeCarousels, matchTier, occupancyTier, personalTier, rankEvents, scoreEvent, type RankContext } from "../event-ranking";
import type { EventRow } from "../types";

const NOW = Date.parse("2026-09-23T08:00:00Z");
const hours = (h: number) => new Date(NOW + h * 3_600_000).toISOString();

function ev(id: string, over: Partial<EventRow> = {}): EventRow {
  return {
    id,
    organizer_id: "stranger",
    title: id,
    category: "board",
    subcategory: "board.strategy",
    image_url: null,
    starts_at: hours(72),
    ends_at: null,
    seats: 9999,
    lat: 32.08,
    lng: 34.78,
    ...over,
  };
}

function ctx(over: Partial<RankContext> = {}): RankContext {
  return {
    me: { id: "me", hobbies: ["fitness.running", "fun"], gender: "female", age: 30, location: { lat: 32.08, lng: 34.78 } },
    following: new Set(["friend", "mutual"]),
    followers: new Set(["fan", "mutual"]),
    myStatus: new Map(),
    pastCategories: new Map([["meet", 2]]),
    approvedCounts: new Map(),
    attendees: new Map(),
    now: NOW,
    ...over,
  };
}

describe("personal tier hierarchy", () => {
  it("orders mine > approved > pending > mutual > iFollow > followsMe > none", () => {
    const c = ctx({ myStatus: new Map([["a", "approved"], ["p", "pending"]]) });
    expect(personalTier(ev("m", { organizer_id: "me" }), c)).toBe("mine");
    expect(personalTier(ev("a"), c)).toBe("approved");
    expect(personalTier(ev("p"), c)).toBe("pending");
    expect(personalTier(ev("x", { organizer_id: "mutual" }), c)).toBe("mutual");
    expect(personalTier(ev("x", { organizer_id: "friend" }), c)).toBe("iFollow");
    expect(personalTier(ev("x", { organizer_id: "fan" }), c)).toBe("followsMe");
    expect(personalTier(ev("x"), c)).toBe("none");
  });
  it("counts only the highest tier (an approved event by a mutual scores as approved)", () => {
    const c = ctx({ myStatus: new Map([["a", "approved"]]) });
    const both = scoreEvent(ev("a", { organizer_id: "mutual" }), c);
    const onlyApproved = scoreEvent(ev("a"), c);
    expect(both.personal).toBe("approved");
    expect(both.total).toBe(onlyApproved.total);
  });
});

describe("match tier", () => {
  it("exact subcategory > category > past taste", () => {
    const c = ctx();
    expect(matchTier(ev("x", { category: "fitness", subcategory: "fitness.running" }), c)).toBe("exactSub");
    expect(matchTier(ev("x", { category: "fun", subcategory: "fun.concert" }), c)).toBe("category");
    expect(matchTier(ev("x", { category: "fitness", subcategory: "fitness.yoga" }), c)).toBe("category");
    expect(matchTier(ev("x", { category: "meet", subcategory: "meet.beer" }), c)).toBe("pastTaste");
    expect(matchTier(ev("x"), c)).toBe("none");
  });
});

describe("occupancy tier", () => {
  it("almost full > filling > moving > empty", () => {
    const counts = new Map([["full", 9], ["half", 5], ["two", 2], ["solo", 1]]);
    const c = ctx({ approvedCounts: counts });
    expect(occupancyTier(ev("full", { seats: 10 }), c)).toBe("almostFull");
    expect(occupancyTier(ev("half", { seats: 10 }), c)).toBe("filling");
    expect(occupancyTier(ev("two", { seats: 10 }), c)).toBe("moving");
    expect(occupancyTier(ev("solo", { seats: 10 }), c)).toBe("empty");
  });
});

describe("ranking", () => {
  it("pushes unrelated events to the end", () => {
    const c = ctx();
    const ranked = rankEvents([ev("unrelated", { starts_at: hours(2) }), ev("run", { category: "fitness", subcategory: "fitness.running" })], c);
    expect(ranked.map((r) => r.event.id)).toEqual(["run", "unrelated"]);
  });
  it("prefers sooner events among equals", () => {
    const c = ctx();
    const a = ev("soon", { category: "fitness", subcategory: "fitness.running", starts_at: hours(5) });
    const b = ev("later", { category: "fitness", subcategory: "fitness.running", starts_at: hours(24 * 10) });
    expect(rankEvents([b, a], c)[0].event.id).toBe("soon");
  });
  it("gives full distance bonus within 5 km", () => {
    const c = ctx();
    const near = scoreEvent(ev("n", { category: "fitness", subcategory: "fitness.running" }), c);
    const far = scoreEvent(ev("f", { category: "fitness", subcategory: "fitness.running", lat: 31.25, lng: 34.79 }), c);
    expect(near.distanceKm).toBeLessThan(1);
    expect(near.total).toBeGreaterThan(far.total);
  });
});

describe("home carousels", () => {
  it("never repeats an event and keeps my events out of recommended", () => {
    const c = ctx();
    const events = [
      ev("mine", { organizer_id: "me", category: "fitness", subcategory: "fitness.running", starts_at: hours(3) }),
      ev("run", { category: "fitness", subcategory: "fitness.running", starts_at: hours(4) }),
      ev("friend", { organizer_id: "friend", starts_at: hours(5) }),
      ev("near", { starts_at: hours(200) }),
    ];
    const car = buildHomeCarousels(events, c);
    const all = [...car.recommended, ...car.startingSoon, ...car.fromFollowing, ...car.nearby, ...car.mine].map((e) => e.id);
    expect(new Set(all).size).toBe(all.length);
    expect(car.recommended.map((e) => e.id)).not.toContain("mine");
    expect(car.mine.map((e) => e.id)).toEqual(["mine"]);
    expect(car.recommended.map((e) => e.id)).toEqual(expect.arrayContaining(["run", "friend"]));
  });
});
