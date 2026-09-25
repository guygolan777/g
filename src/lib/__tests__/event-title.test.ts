import { describe, expect, it } from "vitest";
import { whoComesTitle } from "../event-title";

describe("whoComesTitle", () => {
  it("adds the prefix and a question mark", () => {
    expect(whoComesTitle("כדורגל")).toBe("מי בא לכדורגל?");
    expect(whoComesTitle("שתות בירה")).toBe("מי בא לשתות בירה?");
  });
  it("doesn't double the prefix or the question mark", () => {
    expect(whoComesTitle("מי בא לכדורגל")).toBe("מי בא לכדורגל?");
    expect(whoComesTitle("אכול פלאפל?")).toBe("מי בא לאכול פלאפל?");
    expect(whoComesTitle("מי בא לים??")).toBe("מי בא לים?");
  });
  it("keeps an exclamation and handles empty titles", () => {
    expect(whoComesTitle("מסיבה!")).toBe("מי בא למסיבה!");
    expect(whoComesTitle("")).toBe("מי בא?");
  });
});
