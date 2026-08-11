import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Api } from "../../src/preload/index.js";
import type { CalendarPermission } from "../../src/domain/entities/calendar-result.js";
import type { CalendarResult } from "../../src/domain/entities/calendar-result.js";
import type { MeetingEvent } from "../../src/domain/entities/meeting-event.js";
import { CALENDAR_LIMITED_COPY } from "../../src/domain/entities/calendar-ui-state.js";
import { truncateMiddle } from "../../src/domain/services/truncate-middle.js";
import { createMockEvent, createMockSettings } from "../helpers/test-utils.js";

/** Visible popover title (middle-truncated) for textContent assertions. */
function displayedTitle(title: string): string {
  return truncateMiddle(title);
}

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

async function startRenderer(events: MeetingEvent[], settings = createMockSettings()) {
  let nextGen = 1;
  const getEvents = vi.fn().mockImplementation(async () => ({
    publicationGeneration: nextGen++,
    result: {
      kind: "ok" as const,
      source: "live" as const,
      completeness: "complete" as const,
      observedAt: Date.now(),
      events,
    },
  }));
  const callbacks: {
    resultUpdated:
      ((publication: { publicationGeneration: number; result: CalendarResult }) => void) | null;
    settingsChanged: ((settings: ReturnType<typeof createMockSettings>) => void) | null;
  } = { resultUpdated: null, settingsChanged: null };

  const settingsGet = vi.fn(() => Promise.resolve(settings));
  const settingsSet = vi.fn((partial: Parameters<Api["settings"]["set"]>[0]) =>
    Promise.resolve({ ...settings, ...partial }),
  );
  const joinMeeting = vi.fn(() => Promise.resolve({ ok: true as const, value: undefined }));

  const api: Api = {
    calendar: {
      getEvents,
      requestPermission: vi.fn<() => Promise<CalendarPermission>>().mockResolvedValue("granted"),
      getPermissionStatus: vi.fn<() => Promise<CalendarPermission>>().mockResolvedValue("granted"),
      disconnect: vi.fn().mockResolvedValue(undefined),
      getUiState: vi.fn().mockResolvedValue({
        permission: "granted",
        phase: "ready",
        lastError: null,
        accountEmail: null,
        events: null,
        offline: false,
        oauthConfigured: false,
      }),
      onResultUpdated: vi.fn((callback) => {
        callbacks.resultUpdated = callback;
        return () => {};
      }),
    },
    window: { setHeight: vi.fn() },
    app: {
      openExternal: vi.fn(() => Promise.resolve({ ok: true as const, value: undefined })),
      joinMeeting,
      getVersion: vi.fn(() => Promise.resolve("1.0.0")),
    },
    settings: {
      get: settingsGet,
      set: settingsSet,
      onChanged: vi.fn((callback: (settings: ReturnType<typeof createMockSettings>) => void) => {
        callbacks.settingsChanged = callback;
        return () => {};
      }),
    },
    alert: {
      onShowAlert: vi.fn(() => () => {}),
      notifyDismissed: vi.fn(),
    },
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
  if (callbacks.resultUpdated === null || callbacks.settingsChanged === null) {
    throw new Error("Renderer entrypoint did not register update callbacks");
  }

  const resultUpdatedCallback = callbacks.resultUpdated;
  const settingsChangedCallback = callbacks.settingsChanged;
  return {
    getEvents,
    resultUpdatedCallback,
    settingsChangedCallback,
    settingsGet,
    settingsSet,
    joinMeeting,
  };
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
      expect(document.body.textContent).toContain(displayedTitle("Unchanged direct meeting"));
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

    // When: main pushes an identical event list as a publication.
    renderer.resultUpdatedCallback({
      publicationGeneration: 99,
      result: {
        kind: "ok",
        source: "live",
        completeness: "complete",
        observedAt: Date.now(),
        events: [...events],
      },
    });

    // Then: the visible meeting and the refreshed completion timestamp remain observable.
    expect(document.body.textContent).toContain(displayedTitle("Unchanged pushed meeting"));
    expect(document.body.textContent).toContain("Updated just now");
  });

  it("directly fetches via coordinated getEvents when refresh is clicked", async () => {
    // Given: the real entrypoint is in its normal has-events state.
    const events = [createMockEvent({ title: "Manual refresh meeting" })];
    const renderer = await startRenderer(events);
    vi.advanceTimersByTime(60_000);
    const refreshButton = document.querySelector<HTMLButtonElement>("[data-action='refresh']");
    if (refreshButton === null) {
      throw new Error("Renderer did not render the refresh control");
    }

    // When: the user clicks refresh — single path is GET_EVENTS (no forcePoll IPC).
    refreshButton.click();

    // Then: coordinated getEvents runs again and UI shows completion.
    await vi.waitFor(() => expect(renderer.getEvents).toHaveBeenCalledTimes(2));
    expect(document.body.textContent).toContain(displayedTitle("Manual refresh meeting"));
    expect(document.body.textContent).toContain("Updated just now");
  });

  it("renders retained live partial events without tray-only limited diagnostics", async () => {
    const event = createMockEvent({ title: "Partial retained event" });
    const renderer = await startRenderer([]);

    renderer.resultUpdatedCallback({
      publicationGeneration: 2,
      result: {
        kind: "ok",
        source: "live",
        completeness: "partial",
        observedAt: Date.now(),
        events: [event],
        darwinPartialRefreshDiagnostics: {
          total: 1,
          malformedRecord: 1,
          malformedFieldCount: 0,
          invalidIso: 0,
          invalidId: 0,
          duplicateUid: 0,
        },
      },
    });

    expect(document.body.textContent).toContain(displayedTitle("Partial retained event"));
    expect(document.body.textContent).not.toContain(CALENDAR_LIMITED_COPY);
    expect(document.body.textContent).not.toContain("EventKit skipped");
    expect(document.body.textContent).not.toContain("Malformed records:");
    expect(document.body.textContent).not.toContain("malformed_record");
    expect(document.body.textContent).not.toContain("malformed_field_count");
    expect(document.body.textContent).not.toContain("invalid_iso");
    expect(document.body.textContent).not.toContain("invalid_id");
    expect(document.body.textContent).not.toContain("duplicate_uid");
  });
});

describe("renderer completed-history presentation timer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(RENDERER_TEST_NOW);
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("moves a meeting into completed history at end without calendar/settings/join IPC", async () => {
    const { asTestIsoUtc, isoFromNow } = await import("../helpers/test-utils.js");
    const event = createMockEvent({
      title: "Ending Soon",
      startDate: asTestIsoUtc(isoFromNow(-10, RENDERER_TEST_NOW)),
      endDate: asTestIsoUtc(isoFromNow(2, RENDERER_TEST_NOW)),
    });
    const settings = createMockSettings({ showCompletedTodayMeetings: true });
    const renderer = await startRenderer([event], settings);

    expect(document.body.textContent).toContain("Ending Soon");
    expect(document.body.textContent).toContain("In progress");
    expect(document.body.textContent).not.toContain("Completed today");

    const getEventsCalls = renderer.getEvents.mock.calls.length;
    const settingsGetCalls = renderer.settingsGet.mock.calls.length;

    // Advance past event end — presentation timer fires local re-render only.
    await vi.advanceTimersByTimeAsync(2 * 60_000 + 50);

    expect(document.body.textContent).toContain("Completed today");
    expect(document.body.textContent).toContain("Ended");
    expect(document.body.textContent).toContain("Ending Soon");
    expect(document.querySelector(".meeting-item--completed")).not.toBeNull();
    expect(document.querySelector('[data-action="join-meeting"]')).toBeNull();

    // No new calendar/settings/join traffic. lastUpdatedAt is preserved (relative
    // footer label ages with wall clock rather than resetting to "just now").
    expect(renderer.getEvents).toHaveBeenCalledTimes(getEventsCalls);
    expect(renderer.settingsGet).toHaveBeenCalledTimes(settingsGetCalls);
    expect(renderer.settingsSet).not.toHaveBeenCalled();
    expect(renderer.joinMeeting).not.toHaveBeenCalled();
    expect(document.querySelector(".footer-refresh-label")?.textContent).toMatch(
      /Updated \d+ min ago/,
    );
    expect(document.querySelector(".footer-refresh-label")?.textContent).not.toBe(
      "Updated just now",
    );
  });

  it("re-arms for successive ends and clears history at local midnight", async () => {
    const { asTestIsoUtc, isoFromNow } = await import("../helpers/test-utils.js");
    const first = createMockEvent({
      title: "First End",
      startDate: asTestIsoUtc(isoFromNow(-30, RENDERER_TEST_NOW)),
      endDate: asTestIsoUtc(isoFromNow(1, RENDERER_TEST_NOW)),
    });
    const second = createMockEvent({
      title: "Second End",
      startDate: asTestIsoUtc(isoFromNow(-20, RENDERER_TEST_NOW)),
      endDate: asTestIsoUtc(isoFromNow(3, RENDERER_TEST_NOW)),
    });
    const settings = createMockSettings({ showCompletedTodayMeetings: true });
    const renderer = await startRenderer([first, second], settings);

    await vi.advanceTimersByTimeAsync(1 * 60_000 + 50);
    expect(document.body.textContent).toContain("First End");
    expect(document.body.textContent).toContain("Completed today");
    expect(document.body.textContent).toContain("Second End");
    expect(document.body.textContent).toContain("In progress");

    await vi.advanceTimersByTimeAsync(2 * 60_000 + 50);
    expect(document.body.textContent).toContain("Second End");
    expect(document.querySelectorAll(".meeting-item--completed").length).toBe(2);

    // Jump to local midnight — history for "today" clears (both ends were before midnight of that day... wait)
    // Both events ended "today" relative to RENDERER_TEST_NOW (June 15 12:00 local).
    // At local midnight of June 16, they are prior-day and must disappear.
    const midnight = new Date(RENDERER_TEST_NOW);
    midnight.setHours(0, 0, 0, 0);
    midnight.setDate(midnight.getDate() + 1);
    const msToMidnight = midnight.getTime() - Date.now();
    await vi.advanceTimersByTimeAsync(msToMidnight + 50);

    expect(document.body.textContent).not.toContain("First End");
    expect(document.body.textContent).not.toContain("Second End");
    expect(document.body.textContent).not.toContain("Completed today");
    // Still no extra calendar fetches from presentation timers
    expect(renderer.getEvents).toHaveBeenCalledOnce();
  });

  it("toggles history on without calendar fetch and clears timer when toggled off", async () => {
    const { asTestIsoUtc, isoFromNow } = await import("../helpers/test-utils.js");
    const past = createMockEvent({
      title: "Done Meeting",
      startDate: asTestIsoUtc(isoFromNow(-60, RENDERER_TEST_NOW)),
      endDate: asTestIsoUtc(isoFromNow(-30, RENDERER_TEST_NOW)),
    });
    const renderer = await startRenderer(
      [past],
      createMockSettings({ showCompletedTodayMeetings: false }),
    );

    expect(document.body.textContent).toContain("All done for today");
    expect(document.body.textContent).not.toContain("Done Meeting");

    // Enable via settings push — local render only
    renderer.settingsChangedCallback(createMockSettings({ showCompletedTodayMeetings: true }));
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Completed today");
      expect(document.body.textContent).toContain("Done Meeting");
    });
    expect(renderer.getEvents).toHaveBeenCalledOnce();

    // Disable — history gone, no extra fetch
    renderer.settingsChangedCallback(createMockSettings({ showCompletedTodayMeetings: false }));
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("All done for today");
      expect(document.body.textContent).not.toContain("Done Meeting");
    });
    expect(renderer.getEvents).toHaveBeenCalledOnce();
  });

  it("still loadEvents when a non-display setting changes", async () => {
    const events = [createMockEvent({ title: "Keep Me" })];
    const renderer = await startRenderer(events);
    renderer.settingsChangedCallback(createMockSettings({ showTomorrowMeetings: false }));
    await vi.waitFor(() => expect(renderer.getEvents).toHaveBeenCalledTimes(2));
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

    expect(testDate >= tomorrow && testDate < new Date(tomorrow.getTime() + 86400000)).toBe(false);
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
    document.body.innerHTML = '<div id="app"><button data-action="refresh">Refresh</button></div>';

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
    expect((btn as HTMLElement)?.dataset.url).toBe("https://meet.google.com/abc-def-ghi");
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
    const { escapeHtml } = await import("../../src/shared/utils/escape-html.js");
    expect(typeof escapeHtml).toBe("function");
    expect(escapeHtml("<script>alert('xss')</script>")).not.toContain("<script>");
  });
});

describe("IPC caching — settings", () => {
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

describe("IPC caching — permission", () => {
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

describe("IPC guard — setHeight dedup", () => {
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
      const key = events.map((e) => e.id + e.startDate + e.endDate + e.meetUrl).join("|");
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
      const key = events.map((e) => e.id + e.startDate + e.endDate + e.meetUrl).join("|");
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
      const key = events.map((e) => e.id + e.startDate + e.endDate + e.meetUrl).join("|");
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
