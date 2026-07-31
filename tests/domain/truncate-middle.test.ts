import { describe, it, expect } from "vitest";
import {
  MEETING_TITLE_DISPLAY_MAX_CHARS,
  MIDDLE_TRUNCATE_ELLIPSIS,
  truncateMiddle,
} from "../../src/domain/services/truncate-middle.js";

describe("truncateMiddle", () => {
  it("exports meeting title budget of 25", () => {
    expect(MEETING_TITLE_DISPLAY_MAX_CHARS).toBe(25);
    expect(MIDDLE_TRUNCATE_ELLIPSIS).toBe("\u2026");
  });

  it("returns empty string for empty input", () => {
    expect(truncateMiddle("")).toBe("");
  });

  it("returns short titles unchanged", () => {
    expect(truncateMiddle("1:1")).toBe("1:1");
    expect(truncateMiddle("Standup")).toBe("Standup");
    expect(truncateMiddle("Weekly Product Sync")).toBe("Weekly Product Sync");
  });

  it("returns exact max length unchanged", () => {
    const exact = "1234567890123456789012345";
    expect(Array.from(exact)).toHaveLength(25);
    expect(truncateMiddle(exact)).toBe(exact);
  });

  it("middle-truncates one over the budget (even budget: equal head/tail)", () => {
    // max 25, ellipsis 1 → budget 24 → head 12, tail 12
    const over = "12345678901234567890123456"; // 26 digits
    expect(truncateMiddle(over)).toBe("123456789012\u2026567890123456");
    expect(Array.from(truncateMiddle(over))).toHaveLength(25);
  });

  it("middle-truncates long ASCII titles", () => {
    const title = "Weekly Product Sync with Design";
    const out = truncateMiddle(title);
    // head 12 "Weekly Produ" + … + tail 12 " with Design"
    expect(out).toBe("Weekly Produ\u2026 with Design");
    expect(Array.from(out)).toHaveLength(25);
    expect(out.startsWith("Weekly Produ")).toBe(true);
    expect(out.endsWith(" with Design")).toBe(true);
    expect(out).toContain("\u2026");
  });

  it("respects custom maxChars", () => {
    expect(truncateMiddle("abcdefghij", 5)).toBe("ab\u2026ij");
    expect(Array.from(truncateMiddle("abcdefghij", 5))).toHaveLength(5);
  });

  it("handles maxChars edge cases", () => {
    expect(truncateMiddle("hello", 0)).toBe("");
    expect(truncateMiddle("hello", 1)).toBe("\u2026");
    expect(truncateMiddle("hello", 2)).toBe("h\u2026");
    expect(truncateMiddle("hello", 3)).toBe("h\u2026o");
  });

  it("handles empty ellipsis by keeping a prefix", () => {
    expect(truncateMiddle("abcdefghij", 4, "")).toBe("abcd");
  });

  it("supports multi-character ellipsis tokens", () => {
    // max 25, ellipsis " ... " (5) → budget 20 → head 10, tail 10
    expect(truncateMiddle("123456789012345678901234567890", 25, " ... ")).toBe(
      "1234567890 ... 1234567890",
    );
    expect(
      Array.from(truncateMiddle("123456789012345678901234567890", 25, " ... ")),
    ).toHaveLength(25);
  });

  it("counts emoji as single code points", () => {
    const twentySixRockets = "🚀".repeat(26);
    expect(Array.from(twentySixRockets)).toHaveLength(26);
    const out = truncateMiddle(twentySixRockets);
    expect(Array.from(out)).toHaveLength(25);
    // head 12 rockets + … + tail 12 rockets
    expect(out).toBe("🚀".repeat(12) + "\u2026" + "🚀".repeat(12));
  });

  it("does not split surrogate pairs at the cut", () => {
    const title = "AB" + "🎯".repeat(20) + "CD";
    const out = truncateMiddle(title, 8);
    expect(Array.from(out)).toHaveLength(8);
    expect(Array.from(out).join("")).toBe(out);
  });

  it("preserves whitespace at cut boundaries without trimming", () => {
    // middle spaces survive the cut (no trim)
    const input = "hello there     world extra!!";
    expect(Array.from(input).length).toBeGreaterThan(25);
    const out = truncateMiddle(input);
    expect(Array.from(out)).toHaveLength(25);
    expect(out).toContain("\u2026");
    expect(out.includes(" ")).toBe(true);
  });
});

