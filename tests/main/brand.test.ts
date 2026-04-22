import { describe, it, expect } from "vitest";
import {
  asEventId,
  asIsoUtc,
  asMeetUrl,
  brand,
  type EventId,
  type IsoUtc,
  type MeetUrl,
} from "../../src/shared/brand.js";

describe("asEventId", () => {
  it("brands a non-empty trimmed string", () => {
    const r = asEventId("abc-123");
    expect(r.ok).toBe(true);
    if (r.ok) {
      // Round-trips as a plain string
      expect(r.value).toBe("abc-123");
      // Branded type is assignable down to string
      const s: string = r.value;
      expect(s).toBe("abc-123");
    }
  });

  it("trims surrounding whitespace before branding", () => {
    const r = asEventId("  uid  ");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("uid");
  });

  it("rejects an empty string", () => {
    const r = asEventId("");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/empty/i);
  });

  it("rejects a whitespace-only string", () => {
    const r = asEventId("   ");
    expect(r.ok).toBe(false);
  });
});

describe("asMeetUrl", () => {
  it("brands a valid https Meet URL", () => {
    const r = asMeetUrl("https://meet.google.com/abc-defg-hij");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("https://meet.google.com/abc-defg-hij");
  });

  it("rejects http:// (non-https)", () => {
    const r = asMeetUrl("http://meet.google.com/abc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/https/);
  });

  it("rejects URLs with embedded credentials", () => {
    const r = asMeetUrl("https://evil@meet.google.com/abc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/credentials/);
  });

  it("rejects URLs with non-default ports", () => {
    const r = asMeetUrl("https://meet.google.com:8443/abc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/port/);
  });

  it("rejects unparseable URLs", () => {
    const r = asMeetUrl("https://");
    expect(r.ok).toBe(false);
  });

  it("rejects empty string", () => {
    const r = asMeetUrl("");
    expect(r.ok).toBe(false);
  });

  it("rejects case-variant protocols", () => {
    const r = asMeetUrl("HTTPS://meet.google.com/abc");
    expect(r.ok).toBe(false);
  });
});

describe("asIsoUtc", () => {
  it("brands a canonical Z-suffixed ISO timestamp", () => {
    const r = asIsoUtc("2026-04-22T12:34:56.000Z");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("2026-04-22T12:34:56.000Z");
  });

  it("brands a timestamp with explicit offset", () => {
    const r = asIsoUtc("2026-04-22T12:34:56+02:00");
    expect(r.ok).toBe(true);
  });

  it("brands a bare timestamp by interpreting it as UTC", () => {
    const r = asIsoUtc("2026-04-22T12:34:56");
    expect(r.ok).toBe(true);
  });

  it("rejects a non-parseable string", () => {
    const r = asIsoUtc("not-a-date");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/parseable/);
  });

  it("rejects empty string", () => {
    const r = asIsoUtc("");
    expect(r.ok).toBe(false);
  });

  it("rejects whitespace-only string", () => {
    const r = asIsoUtc("   ");
    expect(r.ok).toBe(false);
  });
});

describe("brand helper", () => {
  it("attaches a phantom tag without altering the runtime value", () => {
    const id: EventId = brand<"EventId", string>("synthetic");
    const url: MeetUrl = brand<"MeetUrl", string>("https://meet.google.com/x");
    const iso: IsoUtc = brand<"IsoUtc", string>("2026-04-22T00:00:00.000Z");
    expect(id).toBe("synthetic");
    expect(url).toBe("https://meet.google.com/x");
    expect(iso).toBe("2026-04-22T00:00:00.000Z");
  });
});
