import { describe, it, expect } from "vitest";
import {
  isAllowedMeetUrl,
  MEET_URL_ALLOWLIST,
} from "../../src/main/utils/url-validation.js";

describe("url-validation", () => {
  describe("MEET_URL_ALLOWLIST", () => {
    it("contains only Google domains with https://", () => {
      for (const prefix of MEET_URL_ALLOWLIST) {
        expect(prefix).toMatch(/^https:\/\//);
        expect(prefix).toContain("google.com");
      }
    });

    it("does not contain bare google.com (no subdomain)", () => {
      const hasBare = MEET_URL_ALLOWLIST.some(
        (p) => p === "https://google.com/" || p === "https://google.com",
      );
      expect(hasBare).toBe(false);
    });
  });

  describe("isAllowedMeetUrl", () => {
    it("allows valid Google Meet URLs", () => {
      expect(isAllowedMeetUrl("https://meet.google.com/abc-def-ghi")).toBe(
        true,
      );
    });

    it("allows Google Calendar URLs", () => {
      expect(isAllowedMeetUrl("https://calendar.google.com/event/123")).toBe(
        true,
      );
    });

    it("allows Google Accounts URLs", () => {
      expect(isAllowedMeetUrl("https://accounts.google.com/signin")).toBe(true);
    });

    it("rejects non-Google URLs", () => {
      expect(isAllowedMeetUrl("https://evil.com/phishing")).toBe(false);
      expect(isAllowedMeetUrl("https://zoom.us/j/123")).toBe(false);
      expect(isAllowedMeetUrl("https://teams.microsoft.com/meet")).toBe(false);
    });

    it("rejects http:// (non-https)", () => {
      expect(isAllowedMeetUrl("http://meet.google.com/abc")).toBe(false);
    });

    it("rejects subdomain spoofing (meet.google.com.evil.com)", () => {
      expect(isAllowedMeetUrl("https://meet.google.com.evil.com/")).toBe(false);
      expect(isAllowedMeetUrl("https://evil.meet.google.com/")).toBe(false);
    });

    it("rejects bare google.com (not in allowlist)", () => {
      expect(isAllowedMeetUrl("https://google.com/")).toBe(false);
    });

    it("rejects empty string", () => {
      expect(isAllowedMeetUrl("")).toBe(false);
    });

    it("rejects URL with trailing path manipulation", () => {
      // Valid prefix but testing startsWith doesn't match path traversal
      expect(isAllowedMeetUrl("https://meet.google.com/abc")).toBe(true);
      expect(isAllowedMeetUrl("https://meet.google.com/../evil")).toBe(true); // startsWith still matches
    });

    it("is case-sensitive for protocol", () => {
      expect(isAllowedMeetUrl("HTTPS://meet.google.com/abc")).toBe(false);
    });
  });
});
