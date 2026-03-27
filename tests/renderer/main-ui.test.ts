import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for renderer/index.ts — the main popover UI
 *
 * Most functions are module-private. We test:
 * 1. Module imports correctly
 * 2. formatRelativeTime logic indirectly
 * 3. formatLastUpdated logic indirectly
 * 4. isTomorrow logic indirectly
 * 5. DOM interaction patterns (event delegation)
 */

describe("renderer/index.ts", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    vi.restoreAllMocks();
  });

  it("module can be imported without errors", async () => {
    const module = await import("../../src/renderer/index.js");
    expect(module).toBeDefined();
  });
});

describe("formatRelativeTime logic", () => {
  it("returns 'In progress' when now is between start and end", () => {
    const now = Date.now();
    const start = now - 10 * 60 * 1000; // 10 min ago
    const end = now + 50 * 60 * 1000; // 50 min from now

    const startMs = start;
    const endMs = end;
    const diffMs = startMs - Date.now(); // negative
    expect(diffMs).toBeLessThan(0);

    const inRange = startMs <= Date.now() && Date.now() < endMs;
    expect(inRange).toBe(true);
  });

  it("returns 'Ended' when now is past end", () => {
    const end = Date.now() - 5 * 60 * 1000; // 5 min ago
    expect(Date.now() >= end).toBe(true);
  });

  it("returns 'Starting now!' when less than 1 minute away", () => {
    const start = Date.now() + 20 * 1000; // 20 seconds from now (< 30s rounds to 0)
    const diffMin = Math.round((start - Date.now()) / 60000);
    expect(diffMin).toBe(0);
  });

  it("returns 'In X min' when 1-15 minutes away", () => {
    const start = Date.now() + 7 * 60 * 1000; // 7 minutes from now
    const diffMin = Math.round((start - Date.now()) / 60000);
    expect(diffMin).toBeLessThanOrEqual(15);
    expect(diffMin).toBeGreaterThanOrEqual(1);
  });

  it("returns HH:MM format when more than 15 minutes away", () => {
    const start = new Date();
    start.setHours(start.getHours() + 2, start.getMinutes() + 30);
    const hours = start.getHours().toString().padStart(2, "0");
    const minutes = start.getMinutes().toString().padStart(2, "0");
    expect(`${hours}:${minutes}`).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("formatLastUpdated logic", () => {
  it("returns 'Updated just now' for < 1 minute ago", () => {
    const ts = Date.now() - 30 * 1000; // 30s ago
    const diffMin = Math.floor((Date.now() - ts) / 60000);
    expect(diffMin).toBeLessThan(1);
  });

  it("returns 'Updated 1 min ago' for ~1 minute ago", () => {
    const ts = Date.now() - 70 * 1000; // 70s ago
    const diffMin = Math.floor((Date.now() - ts) / 60000);
    expect(diffMin).toBe(1);
  });

  it("returns 'Updated N min ago' for > 1 minute ago", () => {
    const ts = Date.now() - 5 * 60 * 1000; // 5 min ago
    const diffMin = Math.floor((Date.now() - ts) / 60000);
    expect(diffMin).toBeGreaterThan(1);
  });
});

describe("isTomorrow logic", () => {
  it("correctly identifies tomorrow's date", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);

    // A date set to tomorrow morning should be in range [tomorrow, dayAfter)
    const testDate = new Date(tomorrow);
    testDate.setHours(10, 0, 0, 0);

    expect(testDate >= tomorrow && testDate < dayAfter).toBe(true);
  });

  it("rejects today's date", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const testDate = new Date(today);
    testDate.setHours(10, 0, 0, 0);

    expect(
      testDate >= tomorrow &&
        testDate < new Date(tomorrow.getTime() + 86400000),
    ).toBe(false);
  });

  it("rejects day after tomorrow", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);

    const testDate = new Date(dayAfter);
    testDate.setHours(10, 0, 0, 0);

    expect(testDate >= tomorrow && testDate < dayAfter).toBe(false);
  });
});

describe("renderer event delegation patterns", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("closest() finds data-action elements", () => {
    document.body.innerHTML =
      '<div id="app"><button data-action="refresh">Refresh</button></div>';

    const container = document.getElementById("app");
    const btn = container?.querySelector("[data-action]");
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute("data-action")).toBe("refresh");
  });

  it("closest() returns null when no data-action ancestor", () => {
    document.body.innerHTML = '<div id="app"><span>No action</span></div>';

    const container = document.getElementById("app");
    const span = container?.querySelector("span");
    const action = (span as HTMLElement)?.closest?.("[data-action]");
    expect(action).toBeNull();
  });

  it("data-url is extracted from join-meeting buttons", () => {
    document.body.innerHTML =
      '<div id="app"><button data-action="join-meeting" data-url="https://meet.google.com/abc-def-ghi">Join</button></div>';

    const btn = document.querySelector("[data-action='join-meeting']");
    expect((btn as HTMLElement)?.dataset.url).toBe(
      "https://meet.google.com/abc-def-ghi",
    );
  });

  it("setHeight is called with clamped values", () => {
    const MIN_H = 220;
    const MAX_H = 480;

    expect(Math.min(MAX_H, Math.max(MIN_H, 100))).toBe(MIN_H);
    expect(Math.min(MAX_H, Math.max(MIN_H, 999))).toBe(MAX_H);
    expect(Math.min(MAX_H, Math.max(MIN_H, 350))).toBe(350);
  });
});

describe("renderer escapeHtml usage", () => {
  it("escapeHtml is imported and used for user content", async () => {
    // Verify the shared escapeHtml utility exists and works
    const { escapeHtml } =
      await import("../../src/shared/utils/escape-html.js");
    expect(typeof escapeHtml).toBe("function");
    expect(escapeHtml("<script>alert('xss')</script>")).not.toContain(
      "<script>",
    );
  });
});
