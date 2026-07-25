import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AlertPayload } from "../../src/shared/alert.js";
import { asTestEventId, asTestIsoUtc } from "../helpers/test-utils.js";

/**
 * Integration-style tests for alert Join + Dismiss wiring against the real
 * alert renderer module (with stubbed window.api).
 */
describe("alert join and dismiss", () => {
  let onShowAlert: ((data: AlertPayload) => void) | null = null;
  const notifyDismissed = vi.fn();
  const joinMeeting = vi.fn().mockResolvedValue({ ok: true, value: undefined });

  beforeEach(async () => {
    vi.resetModules();
    onShowAlert = null;
    notifyDismissed.mockClear();
    joinMeeting.mockClear();
    document.body.innerHTML = '<div id="app"></div>';

    Object.defineProperty(window, "api", {
      configurable: true,
      value: {
        alert: {
          onShowAlert: (cb: (data: AlertPayload) => void) => {
            onShowAlert = cb;
            return () => {
              onShowAlert = null;
            };
          },
          notifyDismissed,
        },
        app: {
          joinMeeting,
        },
      },
    });

    await import("../../src/renderer/alert/index.js");
    document.dispatchEvent(new Event("DOMContentLoaded"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function showAlert(overrides: Partial<AlertPayload> = {}): void {
    const payload: AlertPayload = {
      id: asTestEventId("evt-alert-1"),
      title: "Standup",
      startDate: asTestIsoUtc(new Date().toISOString()),
      endDate: asTestIsoUtc(new Date(Date.now() + 30 * 60_000).toISOString()),
      calendarName: "Work",
      isAllDay: false,
      hasMeetUrl: true,
      ...overrides,
    };
    expect(onShowAlert).toBeTypeOf("function");
    onShowAlert!(payload);
  }

  it("renders Join when hasMeetUrl is true", () => {
    showAlert({ hasMeetUrl: true });
    expect(document.querySelector('[data-action="join"]')).not.toBeNull();
    expect(document.querySelector('[data-action="dismiss"]')).not.toBeNull();
  });

  it("omits Join when hasMeetUrl is false", () => {
    showAlert({ hasMeetUrl: false });
    expect(document.querySelector('[data-action="join"]')).toBeNull();
  });

  it("Join calls app.joinMeeting with event id and notifies dismiss", async () => {
    showAlert({ id: asTestEventId("evt-join-me"), hasMeetUrl: true });
    const joinBtn = document.querySelector<HTMLButtonElement>('[data-action="join"]');
    expect(joinBtn).not.toBeNull();
    joinBtn!.click();

    await vi.waitFor(() => {
      expect(joinMeeting).toHaveBeenCalledWith("evt-join-me");
    });
    await vi.waitFor(() => {
      expect(notifyDismissed).toHaveBeenCalledWith("evt-join-me");
    });
  });

  it("Dismiss notifies main without joining", async () => {
    showAlert({ id: asTestEventId("evt-dismiss"), hasMeetUrl: true });
    document.querySelector<HTMLButtonElement>('[data-action="dismiss"]')!.click();

    await vi.waitFor(() => {
      expect(notifyDismissed).toHaveBeenCalledWith("evt-dismiss");
    });
    expect(joinMeeting).not.toHaveBeenCalled();
  });
});
