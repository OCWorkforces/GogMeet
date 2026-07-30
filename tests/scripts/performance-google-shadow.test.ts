import { describe, it, expect } from "vitest";
import { compareShadowSnapshots } from "../../scripts/performance/lib/google-shadow.mjs";

describe("google shadow comparison", () => {
  it("matches on counts and error class only", () => {
    const a = {
      calendarCount: 2,
      pageCount: 4,
      rawEventCount: 10,
      errorClass: null,
    };
    expect(compareShadowSnapshots(a, { ...a })).toBeNull();
    expect(compareShadowSnapshots(a, { ...a, pageCount: 5 })).toBe("page-count-mismatch");
    expect(compareShadowSnapshots(a, { ...a, errorClass: "auth" })).toBe("error-mismatch");
  });
});
