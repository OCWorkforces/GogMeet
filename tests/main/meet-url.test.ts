import { describe, it, expect } from "vitest";
import { buildMeetUrl } from "../../src/main/utils/meet-url.js";
import type { MeetingEvent } from "../../src/shared/models.js";
import { createMockEvent } from "../helpers/test-utils.js";

function makeEvent(overrides: Partial<MeetingEvent> = {}): MeetingEvent {
  // The original meet-url.test.ts factory omitted userEmail; preserve that
  // semantic so URL-building tests without an explicit email don't get
  // ?authuser= appended unexpectedly.
  return createMockEvent({
    startDate: new Date().toISOString(),
    endDate: new Date().toISOString(),
    userEmail: undefined,
    ...overrides,
  });
}

describe("buildMeetUrl", () => {
  describe("valid Google Meet URLs", () => {
    it("returns URL with authuser when email is present", () => {
      const event = makeEvent({ userEmail: "user@example.com" });
      const url = buildMeetUrl(event);
      expect(url).toBe(
        "https://meet.google.com/abc-def-ghi?authuser=user%40example.com",
      );
    });

    it("returns URL without authuser when email is missing", () => {
      const event = makeEvent({ userEmail: undefined });
      const url = buildMeetUrl(event);
      expect(url).toBe("https://meet.google.com/abc-def-ghi");
    });

    it("returns URL without authuser when email is empty", () => {
      const event = makeEvent({ userEmail: "" });
      const url = buildMeetUrl(event);
      expect(url).toBe("https://meet.google.com/abc-def-ghi");
    });

    it("returns URL without authuser when email has no @", () => {
      const event = makeEvent({ userEmail: "notanemail" });
      const url = buildMeetUrl(event);
      expect(url).toBe("https://meet.google.com/abc-def-ghi");
    });

    it("encodes special characters in email", () => {
      const event = makeEvent({ userEmail: "user+test@example.com" });
      const url = buildMeetUrl(event);
      expect(url).toBe(
        "https://meet.google.com/abc-def-ghi?authuser=user%2Btest%40example.com",
      );
    });

    it("trims whitespace from email", () => {
      const event = makeEvent({ userEmail: "  user@example.com  " });
      const url = buildMeetUrl(event);
      expect(url).toBe(
        "https://meet.google.com/abc-def-ghi?authuser=user%40example.com",
      );
    });
  });

  describe("URL without https:// prefix", () => {
    it("prepends https:// to meet.google.com URLs", () => {
      const event = makeEvent({ meetUrl: "meet.google.com/xyz" });
      const url = buildMeetUrl(event);
      expect(url).toBe("https://meet.google.com/xyz");
    });
  });

  describe("calendar.google.com URLs", () => {
    it("accepts calendar.google.com URLs", () => {
      const event = makeEvent({
        meetUrl: "https://calendar.google.com/event/123",
      });
      const url = buildMeetUrl(event);
      expect(url).toBe("https://calendar.google.com/event/123");
    });
  });

  describe("accounts.google.com URLs", () => {
    it("accepts accounts.google.com URLs", () => {
      const event = makeEvent({
        meetUrl: "https://accounts.google.com/signin",
      });
      const url = buildMeetUrl(event);
      expect(url).toBe("https://accounts.google.com/signin");
    });
  });

  describe("invalid/blocked URLs", () => {
    it("returns empty string for evil.com URLs", () => {
      const event = makeEvent({ meetUrl: "https://evil.com/phishing" });
      const url = buildMeetUrl(event);
      expect(url).toBe("");
    });

    it("returns empty string for non-Google URLs", () => {
      const event = makeEvent({ meetUrl: "https://zoom.us/j/123" });
      const url = buildMeetUrl(event);
      expect(url).toBe("");
    });

    it("returns empty string for google.com (not allowlisted)", () => {
      const event = makeEvent({ meetUrl: "https://google.com/" });
      const url = buildMeetUrl(event);
      expect(url).toBe("");
    });

    it("returns empty string for partial match attacks", () => {
      const event = makeEvent({ meetUrl: "https://meet.google.com.evil.com/" });
      const url = buildMeetUrl(event);
      expect(url).toBe("");
    });

    it("returns empty string for evil.meet.google.com", () => {
      const event = makeEvent({ meetUrl: "https://evil.meet.google.com/" });
      const url = buildMeetUrl(event);
      expect(url).toBe("");
    });

    it("returns empty string for http (not https)", () => {
      const event = makeEvent({ meetUrl: "http://meet.google.com/abc" });
      const url = buildMeetUrl(event);
      expect(url).toBe("");
    });

    it("returns empty string when meetUrl is undefined", () => {
      const event = makeEvent({ meetUrl: undefined });
      const url = buildMeetUrl(event);
      expect(url).toBe("");
    });

    it("returns empty string when meetUrl is empty string", () => {
      const event = makeEvent({ meetUrl: "" });
      const url = buildMeetUrl(event);
      expect(url).toBe("");
    });
  });
});
