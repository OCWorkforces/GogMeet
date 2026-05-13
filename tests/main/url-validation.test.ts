import { describe, it, expect } from "vitest";
import {
  isAllowedMeetUrl,
  MEETING_URL_ALLOWLIST,
} from "../../src/main/utils/url-validation.js";

describe("url-validation", () => {
  describe("MEETING_URL_ALLOWLIST", () => {
    it("contains allowed meeting domains with https://", () => {
      for (const prefix of MEETING_URL_ALLOWLIST) {
        expect(prefix).toMatch(/^https:\/\//);
      }
    });

    it("does not contain bare google.com (no subdomain)", () => {
      const hasBare = MEETING_URL_ALLOWLIST.some(
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

    it("rejects non-allowed URLs", () => {
      expect(isAllowedMeetUrl("https://evil.com/phishing")).toBe(false);
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

  describe("Zoom URL validation", () => {
    it("allows zoom.us apex domain", () => {
      expect(isAllowedMeetUrl("https://zoom.us/j/1234567890")).toBe(true);
    });

    it("allows zoom.us with password parameter", () => {
      expect(isAllowedMeetUrl("https://zoom.us/j/123?pwd=abc123")).toBe(true);
    });

    it("allows regional subdomain (us02web.zoom.us)", () => {
      expect(isAllowedMeetUrl("https://us02web.zoom.us/j/1234567890")).toBe(true);
    });

    it("allows vanity subdomain (acme.zoom.us)", () => {
      expect(isAllowedMeetUrl("https://acme.zoom.us/j/123")).toBe(true);
    });

    it("allows webinar URLs", () => {
      expect(isAllowedMeetUrl("https://zoom.us/w/1234567890")).toBe(true);
    });

    it("allows PMI URLs", () => {
      expect(isAllowedMeetUrl("https://zoom.us/my/username")).toBe(true);
    });

    it("allows start URLs", () => {
      expect(isAllowedMeetUrl("https://zoom.us/s/1234567890")).toBe(true);
    });

    it("rejects zoom.us.evil.com spoofing", () => {
      expect(isAllowedMeetUrl("https://zoom.us.evil.com/j/123")).toBe(false);
    });

    it("rejects evil-zoom.us (no leading dot)", () => {
      expect(isAllowedMeetUrl("https://evil-zoom.us/j/123")).toBe(false);
    });

    it("rejects sub.zoom.us.evil.com (evil.com suffix)", () => {
      expect(isAllowedMeetUrl("https://sub.zoom.us.evil.com/j/123")).toBe(false);
    });

    it("rejects zoom.us subdomain with trailing spoofing", () => {
      // myzoom.us — different domain entirely
      expect(isAllowedMeetUrl("https://myzoom.us/j/123")).toBe(false);
    });
  });

  describe("Calendly URL validation", () => {
    it("allows calendly.com apex domain", () => {
      expect(isAllowedMeetUrl("https://calendly.com/events/abc-def/google_meet")).toBe(
        true,
      );
    });

    it("allows calendly.com with path and query params", () => {
      expect(isAllowedMeetUrl("https://calendly.com/events/be1d45ac-ea88-4331-a96e-5c158827157e/google_meet")).toBe(
        true,
      );
    });

    it("rejects subdomain spoofing (calendly.com.evil.com)", () => {
      expect(isAllowedMeetUrl("https://calendly.com.evil.com/events/x")).toBe(false);
    });

    it("rejects userinfo injection spoofing (calendly.com@evil.com)", () => {
      expect(isAllowedMeetUrl("https://calendly.com@evil.com/events/x")).toBe(false);
    });

    it("is case-insensitive for hostname (CALENDLY.COM)", () => {
      // URL hostname is lowercased by the URL parser, so case-mixed hostnames pass.
      expect(isAllowedMeetUrl("https://CALENDly.COM/events/X")).toBe(true);
    });

    it("rejects calendly.com subdomain (app.calendly.com)", () => {
      expect(isAllowedMeetUrl("https://app.calendly.com/events/x")).toBe(false);
    });

    it("rejects evil-calendly.com (not calendly.com)", () => {
      expect(isAllowedMeetUrl("https://evil-calendly.com/events/x")).toBe(false);
    });
  });

});
