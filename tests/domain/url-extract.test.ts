import { describe, it, expect } from "vitest";
import {
  extractMeetingUrl,
  extractMeetingUrlFromText,
} from "../../src/domain/services/url-extract.js";

describe("extractMeetingUrlFromText", () => {
  it("returns undefined for empty or missing text", () => {
    expect(extractMeetingUrlFromText(undefined)).toBeUndefined();
    expect(extractMeetingUrlFromText("")).toBeUndefined();
    expect(extractMeetingUrlFromText("no links here")).toBeUndefined();
  });

  it("extracts Google Meet URLs", () => {
    expect(
      extractMeetingUrlFromText("Join https://meet.google.com/abc-defg-hij please"),
    ).toBe("https://meet.google.com/abc-defg-hij");
  });

  it("extracts Zoom apex and subdomain URLs", () => {
    expect(extractMeetingUrlFromText("https://zoom.us/j/123456789")).toBe(
      "https://zoom.us/j/123456789",
    );
    expect(extractMeetingUrlFromText("https://us02web.zoom.us/j/987")).toBe(
      "https://us02web.zoom.us/j/987",
    );
  });

  it("extracts Calendly URLs", () => {
    expect(
      extractMeetingUrlFromText("Book: https://calendly.com/team/30min?month=2026-04"),
    ).toBe("https://calendly.com/team/30min?month=2026-04");
  });

  it("prefers Zoom over Meet over Calendly within one text", () => {
    const text = [
      "Calendly https://calendly.com/x/y",
      "Meet https://meet.google.com/aaa-bbbb-ccc",
      "Zoom https://zoom.us/j/1",
    ].join(" ");
    // Zoom appears last but priority is Zoom → Meet → Calendly (first match of highest priority)
    // Implementation tries Zoom regex first across the whole string — finds Zoom regardless of order
    expect(extractMeetingUrlFromText(text)).toBe("https://zoom.us/j/1");
  });

  it("prefers Meet over Calendly when Zoom is absent", () => {
    const text =
      "https://calendly.com/x/y and https://meet.google.com/aaa-bbbb-ccc later";
    expect(extractMeetingUrlFromText(text)).toBe("https://meet.google.com/aaa-bbbb-ccc");
  });

  it("rejects non-allowlisted hosts even if regex-ish", () => {
    expect(
      extractMeetingUrlFromText("https://meet.google.com.evil.com/phish"),
    ).toBeUndefined();
    expect(extractMeetingUrlFromText("http://meet.google.com/abc-defg-hij")).toBeUndefined();
  });

  it("strips trailing punctuation outside the URL charset", () => {
    // Period is not in [^\s"'<>\\]+ stop set in Swift, but we trim trailing junk after match
    const url = extractMeetingUrlFromText("See https://meet.google.com/abc-defg-hij.");
    // match may include trailing `.` depending on regex; trimTrailingJunk removes it
    expect(url).toBe("https://meet.google.com/abc-defg-hij");
  });
});

describe("extractMeetingUrl (multi-field)", () => {
  it("returns the first field that yields a match", () => {
    expect(
      extractMeetingUrl(
        undefined,
        "room A",
        "Join https://meet.google.com/abc-defg-hij",
        "https://zoom.us/j/999",
      ),
    ).toBe("https://meet.google.com/abc-defg-hij");
  });

  it("honors field order over later higher-priority hosts", () => {
    // hangoutLink / location / notes style: earlier field wins even if later has Zoom
    expect(
      extractMeetingUrl(
        "https://meet.google.com/abc-defg-hij",
        "https://zoom.us/j/1",
      ),
    ).toBe("https://meet.google.com/abc-defg-hij");
  });

  it("returns undefined when no field matches", () => {
    expect(extractMeetingUrl(undefined, "", "plain notes")).toBeUndefined();
  });
});
