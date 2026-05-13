import { describe, it, expect } from "vitest";
import { buildMeetUrl } from "../../src/main/utils/meet-url.js";
import type { MeetingEvent } from "../../src/shared/meeting-event.js";
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

    it("accepts Zoom URLs", () => {
      const event = makeEvent({ meetUrl: "https://zoom.us/j/123" });
      const url = buildMeetUrl(event);
      expect(url).toBe("https://zoom.us/j/123");
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

  describe("valid Zoom URLs", () => {
    it("returns Zoom URL with uname when email is present", () => {
      const event = makeEvent({
        meetUrl: "https://zoom.us/j/1234567890",
        userEmail: "user@example.com",
      });
      const url = buildMeetUrl(event);
      expect(url).toBe(
        "https://zoom.us/j/1234567890?uname=user%40example.com",
      );
    });

    it("returns Zoom URL without uname when email is missing", () => {
      const event = makeEvent({ meetUrl: "https://zoom.us/j/123" });
      const url = buildMeetUrl(event);
      expect(url).toBe("https://zoom.us/j/123");
    });

    it("returns Zoom URL without uname when email is empty", () => {
      const event = makeEvent({
        meetUrl: "https://zoom.us/j/123",
        userEmail: "",
      });
      const url = buildMeetUrl(event);
      expect(url).toBe("https://zoom.us/j/123");
    });

    it("encodes special characters in email for Zoom", () => {
      const event = makeEvent({
        meetUrl: "https://zoom.us/j/123",
        userEmail: "user+test@example.com",
      });
      const url = buildMeetUrl(event);
      expect(url).toBe(
        "https://zoom.us/j/123?uname=user%2Btest%40example.com",
      );
    });

    it("trims whitespace from email for Zoom", () => {
      const event = makeEvent({
        meetUrl: "https://zoom.us/j/123",
        userEmail: "  user@example.com  ",
      });
      const url = buildMeetUrl(event);
      expect(url).toBe(
        "https://zoom.us/j/123?uname=user%40example.com",
      );
    });

    it("supports Zoom subdomain URLs", () => {
      const event = makeEvent({
        meetUrl: "https://us02web.zoom.us/j/123?pwd=abc",
        userEmail: "user@example.com",
      });
      const url = buildMeetUrl(event);
      expect(url).toBe(
        "https://us02web.zoom.us/j/123?pwd=abc&uname=user%40example.com",
      );
    });
  });

  describe("Calendly URL handling", () => {
    it("returns Calendly URL unchanged (no authuser appended)", () => {
      const event = makeEvent({
        meetUrl: "https://calendly.com/events/abc-def/google_meet",
        userEmail: "user@example.com",
      });
      const url = buildMeetUrl(event);
      expect(url).toBe("https://calendly.com/events/abc-def/google_meet");
    });

    it("preserves existing query params on Calendly URL", () => {
      const event = makeEvent({
        meetUrl: "https://calendly.com/events/abc-def/google_meet?invitee=123",
        userEmail: "user@example.com",
      });
      const url = buildMeetUrl(event);
      expect(url).toBe(
        "https://calendly.com/events/abc-def/google_meet?invitee=123",
      );
    });

    it("returns Calendly URL without email present", () => {
      const event = makeEvent({
        meetUrl: "https://calendly.com/events/abc-def/google_meet",
      });
      const url = buildMeetUrl(event);
      expect(url).toBe("https://calendly.com/events/abc-def/google_meet");
    });
  });

});
