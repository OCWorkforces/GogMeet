import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DEFAULT_SETTINGS } from "../../src/domain/entities/settings.js";
import { createMockEvent, asTestMeetUrl } from "../helpers/test-utils.js";

/**
 * Exercises additional renderer index paths for coverage.
 */
describe("renderer index coverage paths", () => {
  let onResultUpdated: ((publication: unknown) => void) | null = null;
  let onSettingsChanged: ((s: unknown) => void) | null = null;
  /** Capture DOMContentLoaded handlers so afterEach can remove them. */
  let domReadyHandlers: EventListener[] = [];
  let addEventListenerSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    onResultUpdated = null;
    onSettingsChanged = null;
    domReadyHandlers = [];
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00.000Z"));
    addEventListenerSpy = vi
      .spyOn(document, "addEventListener")
      .mockImplementation((type, listener, options) => {
        if (type === "DOMContentLoaded" && typeof listener === "function") {
          domReadyHandlers.push(listener as EventListener);
        }
        return EventTarget.prototype.addEventListener.call(
          document,
          type,
          listener,
          options,
        );
      });
  });

  afterEach(() => {
    for (const h of domReadyHandlers) {
      document.removeEventListener("DOMContentLoaded", h);
    }
    domReadyHandlers = [];
    addEventListenerSpy?.mockRestore();
    addEventListenerSpy = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function boot(apiOverrides: Record<string, unknown> = {}) {
    let gen = 1;
    const joinMeeting = vi.fn().mockResolvedValue({ ok: true, value: undefined });
    const requestPermission = vi.fn().mockResolvedValue("granted");
    const getPermissionStatus = vi.fn().mockResolvedValue("granted");
    const getEvents = vi.fn().mockImplementation(async () => ({
      publicationGeneration: gen++,
      result: {
        kind: "ok" as const,
        source: "live" as const,
        completeness: "complete" as const,
        observedAt: Date.now(),
        events: [
          createMockEvent({
            meetUrl: asTestMeetUrl("https://meet.google.com/abc-defg-hij"),
          }),
        ],
      },
    }));
    const setHeight = vi.fn();
    const getVersion = vi.fn().mockResolvedValue("9.9.9");
    const getSettings = vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS });

    const calendarBase = {
      getEvents,
      getPermissionStatus,
      requestPermission,
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
      onResultUpdated: (cb: (publication: unknown) => void) => {
        onResultUpdated = cb as typeof onResultUpdated;
        return () => {
          onResultUpdated = null;
        };
      },
    };

    const overrides = { ...apiOverrides } as Record<string, unknown>;
    const calendarOverride =
      overrides["calendar"] && typeof overrides["calendar"] === "object"
        ? (overrides["calendar"] as Record<string, unknown>)
        : {};
    delete overrides["calendar"];
    const appOverride =
      overrides["app"] && typeof overrides["app"] === "object"
        ? (overrides["app"] as Record<string, unknown>)
        : {};
    delete overrides["app"];
    delete overrides["scheduler"];

    vi.stubGlobal("api", {
      window: { setHeight },
      app: {
        getVersion,
        joinMeeting,
        openExternal: vi.fn(),
        ...appOverride,
      },
      calendar: {
        ...calendarBase,
        ...calendarOverride,
      },
      settings: {
        get: getSettings,
        set: vi.fn(),
        onChanged: (cb: (s: unknown) => void) => {
          onSettingsChanged = cb;
          return () => {
            onSettingsChanged = null;
          };
        },
      },
      alert: { onShowAlert: vi.fn(), notifyDismissed: vi.fn() },
      ...overrides,
    });

    await import("../../src/renderer/index.js");
    document.dispatchEvent(new Event("DOMContentLoaded"));
    // Only flush fake timers when they are active (permission tests use real timers).
    try {
      await vi.runAllTimersAsync();
    } catch {
      // real timers
    }
    await Promise.resolve();
    await Promise.resolve();

    return {
      joinMeeting,
      requestPermission,
      getEvents,
      setHeight,
      getPermissionStatus,
    };
  }

  it("shows no-permission UI when calendar permission denied", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    const getPermissionStatus = vi.fn().mockResolvedValue("denied");
    const getEvents = vi.fn().mockResolvedValue({
      publicationGeneration: 1,
      result: { kind: "ok", source: "live", completeness: "complete", observedAt: Date.now(), events: [] },
    });
    await boot({
      calendar: {
        getEvents,
        getPermissionStatus,
        requestPermission,
        onResultUpdated: (cb: (publication: unknown) => void) => {
          onResultUpdated = cb as typeof onResultUpdated;
          return () => {};
        },
      },
    });
    await vi.waitFor(() => {
      expect(document.querySelector('[data-action="grant-access"]')).toBeTruthy();
    });
    expect(getPermissionStatus).toHaveBeenCalled();
    expect(getEvents).not.toHaveBeenCalled();
  });

  it("grantAccess denied stays on no-permission", async () => {
    const requestPermission = vi.fn().mockResolvedValue("denied");
    const getPermissionStatus = vi.fn().mockResolvedValue("not-determined");
    const getEvents = vi.fn().mockResolvedValue({
      publicationGeneration: 1,
      result: { kind: "ok", source: "live", completeness: "complete", observedAt: Date.now(), events: [] },
    });
    await boot({
      calendar: {
        getEvents,
        getPermissionStatus,
        requestPermission,
        onResultUpdated: (cb: (publication: unknown) => void) => {
          onResultUpdated = cb as typeof onResultUpdated;
          return () => {};
        },
      },
    });
    await vi.waitFor(() => {
      expect(document.querySelector('[data-action="grant-access"]')).toBeTruthy();
    });
    document.querySelector<HTMLButtonElement>('[data-action="grant-access"]')!.click();
    await vi.runAllTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
    await vi.waitFor(() => expect(requestPermission).toHaveBeenCalled());
    expect(document.querySelector('[data-action="grant-access"]')).toBeTruthy();
  });

  it("loads events and renders join button", async () => {
    await boot();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-action="join-meeting"]')).toBeTruthy();
    });
  });



  it("renders error state from calendar err", async () => {
    await boot({
      calendar: {
        getEvents: vi.fn().mockResolvedValue({
          publicationGeneration: 1,
          result: {
            kind: "err",
            error: "boom",
            code: "runtime",
          },
        }),
        getPermissionStatus: vi.fn().mockResolvedValue("granted"),
        requestPermission: vi.fn(),
        onResultUpdated: (cb: (publication: unknown) => void) => {
          onResultUpdated = cb as typeof onResultUpdated;
          return () => {};
        },
      },
    });
    await vi.waitFor(() => {
      expect(document.body.textContent).toMatch(/boom/i);
      expect(document.querySelector('[data-action="retry"]')).toBeTruthy();
    });
  });

  it("applies push updates and settings changes", async () => {
    await boot();
    await vi.waitFor(() => expect(onResultUpdated).toBeTypeOf("function"));
    onResultUpdated?.({
      publicationGeneration: 50,
      result: {
        kind: "ok",
        source: "live",
        completeness: "complete",
        observedAt: Date.now(),
        events: [
          createMockEvent({
            id: "push-1" as never,
            title: "Pushed Meet",
            meetUrl: asTestMeetUrl("https://meet.google.com/xyz-abcd-efg"),
          }),
        ],
      },
    });
    await vi.runAllTimersAsync();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Pushed Meet");
    });
    onSettingsChanged?.({ ...DEFAULT_SETTINGS, showTomorrowMeetings: false });
    await vi.runAllTimersAsync();
    expect(document.getElementById("app")?.innerHTML.length).toBeGreaterThan(0);
  });

  it("refresh uses getEvents and join failure logs", async () => {
    const joinMeeting = vi.fn().mockResolvedValue({ ok: false, error: "nope" });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getEvents } = await boot({
      app: {
        getVersion: vi.fn().mockResolvedValue("1"),
        joinMeeting,
        openExternal: vi.fn(),
      },
    });
    await vi.waitFor(() => {
      expect(document.querySelector('[data-action="join-meeting"]')).toBeTruthy();
    });
    document.querySelector<HTMLButtonElement>('[data-action="join-meeting"]')!.click();
    await Promise.resolve();
    expect(joinMeeting).toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
    const callsBefore = getEvents.mock.calls.length;
    document.querySelector<HTMLButtonElement>('[data-action="refresh"]')!.click();
    await vi.waitFor(() => expect(getEvents.mock.calls.length).toBeGreaterThan(callsBefore));
    err.mockRestore();
  });

  it("visibility and keyboard handlers", async () => {
    await boot();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-action="join-meeting"]')).toBeTruthy();
    });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    const join = document.querySelector<HTMLElement>('[data-action="join-meeting"]');
    expect(join).toBeTruthy();
    join!.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(document.querySelector('[data-action="join-meeting"]')).toBeTruthy();
  });


  it("formats footer updated times after push", async () => {
    await boot();
    await vi.waitFor(() => expect(onResultUpdated).toBeTypeOf("function"));
    onResultUpdated?.({
      publicationGeneration: 10,
      result: {
        kind: "ok",
        source: "live",
        completeness: "complete",
        observedAt: Date.now(),
        events: [
          createMockEvent({
            title: "Footer Meet",
            meetUrl: asTestMeetUrl("https://meet.google.com/aaa-bbbb-ccc"),
          }),
        ],
      },
    });
    await vi.runAllTimersAsync();
    vi.setSystemTime(new Date("2026-07-27T12:05:00.000Z"));
    onResultUpdated?.({
      publicationGeneration: 11,
      result: {
        kind: "ok",
        source: "live",
        completeness: "complete",
        observedAt: Date.now(),
        events: [
          createMockEvent({
            id: "later" as never,
            title: "Footer Meet",
            meetUrl: asTestMeetUrl("https://meet.google.com/aaa-bbbb-ccc"),
          }),
        ],
      },
    });
    await vi.runAllTimersAsync();
    expect(document.body.textContent).toMatch(/Updated/i);
  });
});
