import { describe, expect, it } from "vitest";
import { formatPhone, hashPhone, isMobile, normalizePhone } from "../phone";

describe("normalizePhone", () => {
  it("normalizes Israeli formats to 972…", () => {
    for (const v of ["050-1234567", "0501234567", "+972 50 123 4567", "00972501234567", "+972-0501234567", "972501234567"])
      expect(normalizePhone(v)).toBe("972501234567");
  });
  it("keeps other countries", () => {
    expect(normalizePhone("+1 (415) 555-2671")).toBe("14155552671");
  });
  it("rejects junk", () => {
    for (const v of ["", "123", "hello", "050-12", "+972 12"]) expect(normalizePhone(v)).toBeNull();
  });
  it("mobile check and display", () => {
    expect(isMobile("972501234567")).toBe(true);
    expect(isMobile("97231234567")).toBe(false);
    expect(formatPhone("972501234567")).toBe("050-123-4567");
  });
  it("hash matches Postgres sha256 hex of the digits", async () => {
    // select encode(digest('972501234567','sha256'),'hex')
    expect(await hashPhone("972501234567")).toBe("1b28f71583657cd11ff8ad48a922f9a3b051fdb267ffc4fe88c47db2338629f4");
  });
});
