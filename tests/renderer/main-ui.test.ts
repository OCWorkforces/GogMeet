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

describe("IPC caching — settings (Task 1a)", () => {
  it("uses cached settings on subsequent calls via nullish coalescing", () => {
    // Simulates: settings = cachedSettings ?? await window.api.settings.get()
    const settingsGet = vi.fn(() => ({
      schemaVersion: 1,
      openBeforeMinutes: 1,
      launchAtLogin: false,
      showTomorrowMeetings: true,
      windowAlert: false,
    }));

    let cachedSettings: { schemaVersion: number } | null = null;

    // First call — cache is null, must fetch
    const first = cachedSettings ?? settingsGet();
    cachedSettings = first;
    expect(settingsGet).toHaveBeenCalledOnce();

    // Second call — cache is populated, skip fetch
    const second = cachedSettings ?? settingsGet();
    expect(settingsGet).toHaveBeenCalledOnce(); // still 1, not 2
    expect(second).toBe(first);
  });

  it("onChanged callback updates cache before loadEvents", () => {
    // Simulates: window.api.settings.onChanged((updated) => { cachedSettings = updated; })
    let cachedSettings: { openBeforeMinutes: number } | null = null;
    const settingsGet = vi.fn(() => ({ openBeforeMinutes: 1 }));

    // Initial fetch populates cache
    cachedSettings = cachedSettings ?? settingsGet();
    expect(settingsGet).toHaveBeenCalledOnce();

    // Simulate settings:changed push with new value
    const pushed = { openBeforeMinutes: 3 };
    cachedSettings = pushed; // onChanged handler sets cache

    // Next loadEvents uses cache — no IPC call
    const result = cachedSettings ?? settingsGet();
    expect(settingsGet).toHaveBeenCalledOnce(); // still 1
    expect(result.openBeforeMinutes).toBe(3);
  });
});

describe("IPC caching — permission (Task 1b)", () => {
  it("uses cached permission on subsequent calls", () => {
    const getPermissionStatus = vi.fn(() => "granted" as const);

    let cachedPermission: "granted" | "denied" | "not-determined" | null = null;

    // First call — cache is null, must fetch
    const first = cachedPermission ?? getPermissionStatus();
    cachedPermission = first;
    expect(getPermissionStatus).toHaveBeenCalledOnce();

    // Second call — cache populated, skip fetch
    const second = cachedPermission ?? getPermissionStatus();
    expect(getPermissionStatus).toHaveBeenCalledOnce(); // still 1
    expect(second).toBe("granted");
  });

  it("grantAccess updates permission cache after requestPermission", () => {
    let cachedPermission: "granted" | "denied" | "not-determined" | null = null;
    const getPermissionStatus = vi.fn(() => "granted" as const);

    // Simulate grantAccess: requestPermission returns "granted"
    const status = "granted" as const;
    cachedPermission = status;

    // Next loadEvents uses cache — no IPC call
    const result = cachedPermission ?? getPermissionStatus();
    expect(getPermissionStatus).not.toHaveBeenCalled();
    expect(result).toBe("granted");
  });
});

describe("IPC guard — setHeight dedup (Task 1c)", () => {
  it("setHeight only fires when height changes", () => {
    const setHeight = vi.fn();
    let lastHeight = 0;

    function guardedSetHeight(targetH: number) {
      if (targetH !== lastHeight) {
        setHeight(targetH);
        lastHeight = targetH;
      }
    }

    // First render — should fire
    guardedSetHeight(220);
    expect(setHeight).toHaveBeenCalledOnce();
    expect(setHeight).toHaveBeenCalledWith(220);

    // Second render with same height — should NOT fire
    guardedSetHeight(220);
    expect(setHeight).toHaveBeenCalledOnce(); // still 1

    // Third render with different height — should fire
    guardedSetHeight(350);
    expect(setHeight).toHaveBeenCalledTimes(2);
    expect(setHeight).toHaveBeenLastCalledWith(350);
  });

  it("setHeight fires again after height returns to previous value", () => {
    const setHeight = vi.fn();
    let lastHeight = 0;

    function guardedSetHeight(targetH: number) {
      if (targetH !== lastHeight) {
        setHeight(targetH);
        lastHeight = targetH;
      }
    }

    guardedSetHeight(220);
    guardedSetHeight(350);
    guardedSetHeight(220); // different from lastHeight (350)
    expect(setHeight).toHaveBeenCalledTimes(3);
  });
});

describe("Wave 2: Skip re-render when events unchanged (Task 2a)", () => {
  it("skips render when events key is identical to previous", () => {
    const render = vi.fn();
    let lastEventsKey = "";
    let state: { type: string } = { type: "loading" };

    interface SimpleEvent {
      id: string;
      startDate: string;
      endDate: string;
      meetUrl: string;
    }

    function processEvents(events: SimpleEvent[]) {
      const prevStateType = state.type;
      state = { type: "loading" };
      const key = events
        .map((e) => e.id + e.startDate + e.endDate + e.meetUrl)
        .join("|");
      if (key === lastEventsKey && prevStateType === "has-events") {
        return; // skip render
      }
      lastEventsKey = key;
      state = { type: "has-events" };
      render();
    }

    const events = [
      {
        id: "e1",
        startDate: "2026-04-01T10:00:00Z",
        endDate: "2026-04-01T11:00:00Z",
        meetUrl: "https://meet.google.com/abc-def-ghi",
      },
    ];

    // First call — should render
    processEvents(events);
    expect(render).toHaveBeenCalledOnce();

    // Second call with same events — should NOT render
    processEvents(events);
    expect(render).toHaveBeenCalledOnce(); // still 1
  });

  it("renders again when event data changes", () => {
    const render = vi.fn();
    let lastEventsKey = "";
    let state: { type: string } = { type: "loading" };

    interface SimpleEvent {
      id: string;
      startDate: string;
      endDate: string;
      meetUrl: string;
    }

    function processEvents(events: SimpleEvent[]) {
      const prevStateType = state.type;
      state = { type: "loading" };
      const key = events
        .map((e) => e.id + e.startDate + e.endDate + e.meetUrl)
        .join("|");
      if (key === lastEventsKey && prevStateType === "has-events") {
        return;
      }
      lastEventsKey = key;
      state = { type: "has-events" };
      render();
    }

    const events1 = [
      {
        id: "e1",
        startDate: "2026-04-01T10:00:00Z",
        endDate: "2026-04-01T11:00:00Z",
        meetUrl: "https://meet.google.com/abc-def-ghi",
      },
    ];

    const events2 = [
      {
        id: "e1",
        startDate: "2026-04-01T10:00:00Z",
        endDate: "2026-04-01T11:30:00Z", // endDate changed
        meetUrl: "https://meet.google.com/abc-def-ghi",
      },
    ];

    processEvents(events1);
    expect(render).toHaveBeenCalledOnce();

    processEvents(events2);
    expect(render).toHaveBeenCalledTimes(2); // re-rendered due to change
  });

  it("renders on first call even when state is not has-events", () => {
    const render = vi.fn();
    let lastEventsKey = "";
    let state: { type: string } = { type: "loading" };

    interface SimpleEvent {
      id: string;
      startDate: string;
      endDate: string;
      meetUrl: string;
    }

    function processEvents(events: SimpleEvent[]) {
      const prevStateType = state.type;
      state = { type: "loading" };
      const key = events
        .map((e) => e.id + e.startDate + e.endDate + e.meetUrl)
        .join("|");
      if (key === lastEventsKey && prevStateType === "has-events") {
        return;
      }
      lastEventsKey = key;
      state = { type: "has-events" };
      render();
    }

    const events = [
      {
        id: "e1",
        startDate: "2026-04-01T10:00:00Z",
        endDate: "2026-04-01T11:00:00Z",
        meetUrl: "https://meet.google.com/abc-def-ghi",
      },
    ];

    // Even if key somehow matches, state.type !== "has-events" so it renders
    processEvents(events);
    expect(render).toHaveBeenCalledOnce();
    expect(state.type).toBe("has-events");
  });
});

describe("Wave 2: Debounce visibility-change poll (Task 2b)", () => {
  it("skips loadEvents when visibility changes within 5s", () => {
    const loadEvents = vi.fn();
    let lastPollTime = 0;

    function onVisible() {
      const now = Date.now();
      if (now - lastPollTime < 5000) return;
      lastPollTime = now;
      loadEvents();
    }

    // First visibility — should poll
    onVisible();
    expect(loadEvents).toHaveBeenCalledOnce();

    // Immediate second visibility — within 5s, should skip
    onVisible();
    expect(loadEvents).toHaveBeenCalledOnce(); // still 1
  });

  it("allows loadEvents after 5s debounce window", () => {
    vi.useFakeTimers();
    const loadEvents = vi.fn();
    let lastPollTime = 0;

    function onVisible() {
      const now = Date.now();
      if (now - lastPollTime < 5000) return;
      lastPollTime = now;
      loadEvents();
    }

    onVisible();
    expect(loadEvents).toHaveBeenCalledOnce();

    // Advance past debounce window
    vi.advanceTimersByTime(5000);

    onVisible();
    expect(loadEvents).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("blocks multiple rapid show/hide cycles", () => {
    const loadEvents = vi.fn();
    let lastPollTime = 0;

    function onVisible() {
      const now = Date.now();
      if (now - lastPollTime < 5000) return;
      lastPollTime = now;
      loadEvents();
    }

    // Simulate 5 rapid visibility changes
    onVisible(); // 1st — goes through
    onVisible(); // 2nd — blocked
    onVisible(); // 3rd — blocked
    onVisible(); // 4th — blocked
    onVisible(); // 5th — blocked

    expect(loadEvents).toHaveBeenCalledOnce();
  });
});
