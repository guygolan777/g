import { describe, expect, it } from "vitest";
import { toggleTrait } from "../traits";

describe("toggleTrait", () => {
  it("keeps one relationship status", () => {
    expect(toggleTrait(["single", "parent"], "married")).toEqual(["parent", "married"]);
    expect(toggleTrait(["married"], "divorced")).toEqual(["divorced"]);
  });
  it("keeps traits that don't clash", () => {
    expect(toggleTrait(["single"], "parent")).toEqual(["single", "parent"]);
    expect(toggleTrait(["smoker", "vegan"], "sporty")).toEqual(["smoker", "vegan", "sporty"]);
  });
  it("rules out opposite habits", () => {
    expect(toggleTrait(["smoker", "vegan"], "non_smoker")).toEqual(["vegan", "non_smoker"]);
    expect(toggleTrait(["vegetarian"], "vegan")).toEqual(["vegan"]);
  });
  it("still toggles off and keeps single-choice groups", () => {
    expect(toggleTrait(["single"], "single")).toEqual([]);
    expect(toggleTrait(["secular", "single"], "religious")).toEqual(["single", "religious"]);
  });
});
