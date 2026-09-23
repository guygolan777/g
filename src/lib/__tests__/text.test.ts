import { describe, expect, it } from "vitest";
import { whoComesTitle } from "../event-title";
import { messagePreview } from "../message-text";
import { ALL_TRAITS, toggleTrait } from "../traits";
import { HOBBY_CATEGORIES, hobbyLabel } from "../hobby-categories";

describe("whoComesTitle", () => {
  it("prefixes once", () => {
    expect(whoComesTitle("ריצת בוקר")).toBe("מי בא לריצת בוקר");
    expect(whoComesTitle("מי בא לריצת בוקר")).toBe("מי בא לריצת בוקר");
  });
});

describe("messagePreview", () => {
  it("phrases story replies from the viewer's side", () => {
    const m = { kind: "story_reply" as const, body: "וואו", sender_id: "a" };
    expect(messagePreview(m, "a")).toContain("הגבת לסטורי");
    expect(messagePreview(m, "b")).toContain("הגיב/ה לסטורי שלך");
  });
});

describe("catalogs", () => {
  it("has 14 categories and ~36 traits", () => {
    expect(HOBBY_CATEGORIES).toHaveLength(14);
    expect(ALL_TRAITS.length).toBe(36);
    expect(hobbyLabel("sport.running")).toBe("🏃 ריצה");
  });
  it("single-choice trait groups replace the previous choice", () => {
    expect(toggleTrait(["single", "dog_lover"], "married").sort()).toEqual(["dog_lover", "married"]);
    expect(toggleTrait(["dog_lover"], "cat_lover").sort()).toEqual(["cat_lover", "dog_lover"]);
  });
});
