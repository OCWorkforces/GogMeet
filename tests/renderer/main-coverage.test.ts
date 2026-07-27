import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DEFAULT_SETTINGS } from "../../src/domain/entities/settings.js";
import { createMockEvent, asTestMeetUrl } from "../helpers/test-utils.js";

/**
 * Exercises additional renderer index paths for coverage.
 */
describe("renderer index coverage paths", () => {
  let onEventsUpdated: ((events: unknown[]) => void) | null = null;
  let onSettingsChanged: ((s: unknown) => void) | null = null;
  /** Capture DOMContentLoaded handlers so afterEach can remove them. */
  let domReadyHandlers: EventListener[] = [];
  let addEventListenerSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    onEventsUpdated = null;
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
    const forcePoll = vi.fn();
    const joinMeeting = vi.fn().mockResolvedValue({ ok: true, value: undefined });
    const requestPermission = vi.fn().mockResolvedValue("granted");
    const getPermissionStatus = vi.fn().mockResolvedValue("granted");
    const getEvents = vi.fn().mockResolvedValue({
      kind: "ok",
      events: [
        createMockEvent({
          meetUrl: asTestMeetUrl("https://meet.google.com/abc-defg-hij"),
        }),
      ],
    });
    const setHeight = vi.fn();
    const getVersion = vi.fn().mockResolvedValue("9.9.9");
    const getSettings = vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS });

    const calendarBase = {
      getEvents,
      getPermissionStatus,
      requestPermission,
      onEventsUpdated: (cb: (events: unknown[]) => void) => {
        onEventsUpdated = cb;
        return () => {
          onEventsUpdated = null;
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
    const schedulerOverride =
      overrides["scheduler"] && typeof overrides["scheduler"] === "object"
        ? (overrides["scheduler"] as Record<string, unknown>)
        : {};
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
      scheduler: { forcePoll, ...schedulerOverride },
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
      forcePoll,
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
    const getEvents = vi.fn().mockResolvedValue({ kind: "ok", events: [] });
    await boot({
      calendar: {
        getEvents,
        getPermissionStatus,
        requestPermission,
        onEventsUpdated: (cb: (events: unknown[]) => void) => {
          onEventsUpdated = cb;
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
    const getEvents = vi.fn().mockResolvedValue({ kind: "ok", events: [] });
    await boot({
      calendar: {
        getEvents,
        getPermissionStatus,
        requestPermission,
        onEventsUpdated: (cb: (e: unknown[]) => void) => {
          onEventsUpdated = cb;
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
          kind: "err",
          error: "boom",
          code: "runtime",
        }),
        getPermissionStatus: vi.fn().mockResolvedValue("granted"),
        requestPermission: vi.fn(),
        onEventsUpdated: (cb: (e: unknown[]) => void) => {
          onEventsUpdated = cb;
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
    await vi.waitFor(() => expect(onEventsUpdated).toBeTypeOf("function"));
    onEventsUpdated?.([
      createMockEvent({
        id: "push-1" as never,
        title: "Pushed Meet",
        meetUrl: asTestMeetUrl("https://meet.google.com/xyz-abcd-efg"),
      }),
    ]);
    await vi.runAllTimersAsync();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Pushed Meet");
    });
    onSettingsChanged?.({ ...DEFAULT_SETTINGS, showTomorrowMeetings: false });
    await vi.runAllTimersAsync();
    expect(document.getElementById("app")?.innerHTML.length).toBeGreaterThan(0);
  });

  it("force-poll on refresh and join failure logs", async () => {
    const joinMeeting = vi.fn().mockResolvedValue({ ok: false, error: "nope" });
    const forcePoll = vi.fn();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await boot({
      app: {
        getVersion: vi.fn().mockResolvedValue("1"),
        joinMeeting,
        openExternal: vi.fn(),
      },
      scheduler: { forcePoll },
    });
    await vi.waitFor(() => {
      expect(document.querySelector('[data-action="join-meeting"]')).toBeTruthy();
    });
    document.querySelector<HTMLButtonElement>('[data-action="join-meeting"]')!.click();
    await Promise.resolve();
    expect(joinMeeting).toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
    document.querySelector<HTMLButtonElement>('[data-action="refresh"]')!.click();
    expect(forcePoll).toHaveBeenCalled();
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
    await vi.waitFor(() => expect(onEventsUpdated).toBeTypeOf("function"));
    onEventsUpdated?.([
      createMockEvent({
        title: "Footer Meet",
        meetUrl: asTestMeetUrl("https://meet.google.com/aaa-bbbb-ccc"),
      }),
    ]);
    await vi.runAllTimersAsync();
    vi.setSystemTime(new Date("2026-07-27T12:05:00.000Z"));
    onEventsUpdated?.([
      createMockEvent({
        id: "later" as never,
        title: "Footer Meet",
        meetUrl: asTestMeetUrl("https://meet.google.com/aaa-bbbb-ccc"),
      }),
    ]);
    await vi.runAllTimersAsync();
    expect(document.body.textContent).toMatch(/Updated/i);
  });
});
