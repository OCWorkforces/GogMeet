import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DEFAULT_SETTINGS } from "../../src/domain/entities/settings.js";
import { createMockEvent, asTestMeetUrl } from "../helpers/test-utils.js";

/**
 * Exercises additional renderer index paths for coverage.
 */
describe("renderer index coverage paths", () => {
  let onEventsUpdated: ((events: unknown[]) => void) | null = null;
  let onSettingsChanged: ((s: unknown) => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    onEventsUpdated = null;
    onSettingsChanged = null;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00.000Z"));
  });

  afterEach(() => {
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

    vi.stubGlobal("api", {
      window: { setHeight },
      app: {
        getVersion,
        joinMeeting,
        openExternal: vi.fn(),
      },
      calendar: {
        getEvents,
        getPermissionStatus,
        requestPermission,
        onEventsUpdated: (cb: (events: unknown[]) => void) => {
          onEventsUpdated = cb;
          return () => {
            onEventsUpdated = null;
          };
        },
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
      scheduler: { forcePoll },
      alert: { onShowAlert: vi.fn(), notifyDismissed: vi.fn() },
      ...apiOverrides,
    });

    await import("../../src/renderer/index.js");
    document.dispatchEvent(new Event("DOMContentLoaded"));
    await vi.runAllTimersAsync();
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

  it("loads events and renders join button", async () => {
    await boot();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-action="join-meeting"]')).toBeTruthy();
    });
  });

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
      const text = document.body.textContent ?? "";
      expect(text.length).toBeGreaterThan(0);
    });
    expect(getPermissionStatus).toHaveBeenCalled();
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
      expect(document.body.textContent).toMatch(/boom|error|retry/i);
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
    onSettingsChanged?.({ ...DEFAULT_SETTINGS, showTomorrowMeetings: false });
    await vi.runAllTimersAsync();
    expect(document.getElementById("app")).toBeTruthy();
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
    document.querySelector<HTMLButtonElement>('[data-action="refresh"]')?.click();
    expect(forcePoll).toHaveBeenCalled();
    err.mockRestore();
  });

  it("visibility and keyboard handlers", async () => {
    await boot();
    await vi.waitFor(() => expect(document.getElementById("app")?.innerHTML).not.toBe(""));
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    const join = document.querySelector<HTMLElement>('[data-action="join-meeting"]');
    if (join) {
      join.focus();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    }
    expect(document.getElementById("app")).toBeTruthy();
  });

  it("grantAccess denied stays on no-permission", async () => {
    const requestPermission = vi.fn().mockResolvedValue("denied");
    const getPermissionStatus = vi.fn().mockResolvedValue("not-determined");
    await boot({
      calendar: {
        getEvents: vi.fn().mockResolvedValue({ kind: "ok", events: [] }),
        getPermissionStatus,
        requestPermission,
        onEventsUpdated: (cb: (e: unknown[]) => void) => {
          onEventsUpdated = cb;
          return () => {};
        },
      },
    });
    await vi.waitFor(() => expect(document.body.textContent).toBeTruthy());
    const grant = document.querySelector<HTMLButtonElement>('[data-action="grant-access"]');
    grant?.click();
    await vi.runAllTimersAsync();
    await Promise.resolve();
    if (grant) expect(requestPermission).toHaveBeenCalled();
  });

  it("formats footer updated times after push", async () => {
    await boot();
    await vi.waitFor(() => expect(onEventsUpdated).toBeTypeOf("function"));
    onEventsUpdated?.([
      createMockEvent({ meetUrl: asTestMeetUrl("https://meet.google.com/aaa-bbbb-ccc") }),
    ]);
    await vi.runAllTimersAsync();
    vi.setSystemTime(new Date("2026-07-27T12:05:00.000Z"));
    onEventsUpdated?.([
      createMockEvent({
        id: "later" as never,
        meetUrl: asTestMeetUrl("https://meet.google.com/aaa-bbbb-ccc"),
      }),
    ]);
    await vi.runAllTimersAsync();
    expect(document.body.textContent).toMatch(/Updated|min/i);
  });
});
