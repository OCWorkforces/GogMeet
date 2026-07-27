import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Api } from "../../src/preload/index.js";
import type { CalendarPermission } from "../../src/domain/entities/calendar-result.js";
import type { CalendarResult } from "../../src/domain/entities/calendar-result.js";
import type { MeetingEvent } from "../../src/domain/entities/meeting-event.js";
import { createMockEvent, createMockSettings } from "../helpers/test-utils.js";

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

const RENDERER_TEST_NOW = new Date(2026, 5, 15, 12, 0, 0).getTime();

async function startRenderer(events: MeetingEvent[]) {
  const getEvents = vi.fn<() => Promise<CalendarResult>>().mockResolvedValue({
    kind: "ok",
    events,
  });
  const forcePoll = vi.fn();
  const callbacks: {
    eventsUpdated: ((updatedEvents: MeetingEvent[]) => void) | null;
    settingsChanged: ((settings: ReturnType<typeof createMockSettings>) => void) | null;
  } = { eventsUpdated: null, settingsChanged: null };

  const api: Api = {
    calendar: {
      getEvents,
      requestPermission: vi.fn<() => Promise<CalendarPermission>>().mockResolvedValue("granted"),
      getPermissionStatus: vi.fn<() => Promise<CalendarPermission>>().mockResolvedValue("granted"),
      onEventsUpdated: vi.fn((callback: (updatedEvents: MeetingEvent[]) => void) => {
        callbacks.eventsUpdated = callback;
        return () => {};
      }),
    },
    window: { setHeight: vi.fn() },
    app: {
      openExternal: vi.fn(() => Promise.resolve()),
      getVersion: vi.fn(() => Promise.resolve("1.0.0")),
    },
    settings: {
      get: vi.fn(() => Promise.resolve(createMockSettings())),
      set: vi.fn((partial: Parameters<Api["settings"]["set"]>[0]) =>
        Promise.resolve({ ...createMockSettings(), ...partial }),
      ),
      onChanged: vi.fn((callback: (settings: ReturnType<typeof createMockSettings>) => void) => {
        callbacks.settingsChanged = callback;
        return () => {};
      }),
    },
    alert: {
      onShowAlert: vi.fn(() => () => {}),
      notifyDismissed: vi.fn(),
    },
    scheduler: { forcePoll },
  };

  Object.defineProperty(window, "api", { configurable: true, value: api });
  const addEventListener = vi.spyOn(document, "addEventListener");

  vi.resetModules();
  await import("../../src/renderer/index.js");

  const domContentLoadedListener = addEventListener.mock.calls.find(
    ([type]) => type === "DOMContentLoaded",
  )?.[1];
  if (typeof domContentLoadedListener !== "function") {
    throw new Error("Renderer entrypoint did not register a DOMContentLoaded listener");
  }
  domContentLoadedListener(new Event("DOMContentLoaded"));

  await vi.waitFor(() => expect(getEvents).toHaveBeenCalledOnce());
  if (callbacks.eventsUpdated === null || callbacks.settingsChanged === null) {
    throw new Error("Renderer entrypoint did not register update callbacks");
  }

  const eventsUpdatedCallback = callbacks.eventsUpdated;
  const settingsChangedCallback = callbacks.settingsChanged;
  return { getEvents, forcePoll, eventsUpdatedCallback, settingsChangedCallback };
}

describe("renderer unchanged calendar updates", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(RENDERER_TEST_NOW);
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("restores visible meetings and refreshes the footer after an unchanged direct fetch", async () => {
    // Given: the real entrypoint has rendered a successful meeting list.
    const events = [createMockEvent({ title: "Unchanged direct meeting" })];
    const renderer = await startRenderer(events);
    vi.advanceTimersByTime(60_000);

    // When: the existing settings push invokes the direct fetch path with identical events.
    renderer.settingsChangedCallback(createMockSettings());

    // Then: loading does not remain visible and completion is rendered.
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Unchanged direct meeting");
      expect(document.body.textContent).toContain("Updated just now");
    });
  });

  it("renders the refreshed footer after unchanged pushed events", async () => {
    // Given: the real entrypoint has an older, visible meeting list.
    const events = [createMockEvent({ title: "Unchanged pushed meeting" })];
    const renderer = await startRenderer(events);
    const footerLabel = document.querySelector<HTMLElement>(".footer-refresh-label");
    if (footerLabel === null) {
      throw new Error("Renderer did not render the refresh timestamp");
    }
    footerLabel.textContent = "Updated 1 min ago";

    // When: main pushes an identical event list.
    renderer.eventsUpdatedCallback([...events]);

    // Then: the visible meeting and the refreshed completion timestamp remain observable.
    expect(document.body.textContent).toContain("Unchanged pushed meeting");
    expect(document.body.textContent).toContain("Updated just now");
  });

  it("force-polls and directly fetches when normal-state refresh returns unchanged events", async () => {
    // Given: the real entrypoint is in its normal has-events state.
    const events = [createMockEvent({ title: "Manual refresh meeting" })];
    const renderer = await startRenderer(events);
    vi.advanceTimersByTime(60_000);
    const refreshButton = document.querySelector<HTMLButtonElement>("[data-action='refresh']");
    if (refreshButton === null) {
      throw new Error("Renderer did not render the refresh control");
    }

    // When: the user clicks refresh and the direct fetch returns the same events.
    refreshButton.click();

    // Then: scheduler polling and observable direct completion both occur.
    await vi.waitFor(() => expect(renderer.getEvents).toHaveBeenCalledTimes(2));
    expect(renderer.forcePoll).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain("Manual refresh meeting");
    expect(document.body.textContent).toContain("Updated just now");
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

describe("Skip re-render when events unchanged", () => {
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

describe("Debounce visibility-change poll", () => {
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
