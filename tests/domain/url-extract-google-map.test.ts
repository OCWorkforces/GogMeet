import { describe, it, expect } from "vitest";
import { extractMeetingUrl } from "../../src/domain/services/url-extract.js";
import { cleanDescription } from "../../src/domain/services/clean-description.js";

/**
 * Smoke tests for the field order used by the Google Calendar provider:
 * hangoutLink → conference entry points → location → description
 */
describe("Google field URL extraction order", () => {
  it("prefers hangoutLink over later Zoom in notes", () => {
    expect(
      extractMeetingUrl(
        "https://meet.google.com/abc-defg-hij",
        "https://zoom.us/j/1",
        "notes with https://zoom.us/j/2",
      ),
    ).toBe("https://meet.google.com/abc-defg-hij");
  });

  it("finds Zoom in cleaned description text", () => {
    const notes = cleanDescription(
      "Join us at https://us02web.zoom.us/j/555 thanks",
    );
    expect(extractMeetingUrl(undefined, undefined, notes)).toBe(
      "https://us02web.zoom.us/j/555",
    );
  });
});

