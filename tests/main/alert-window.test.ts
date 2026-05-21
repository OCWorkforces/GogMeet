import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock electron before importing alert-window — must use function keyword for constructor
vi.mock("electron", () => {
  const mockSend = vi.fn();
  const mockLoadURL = vi.fn().mockResolvedValue(undefined);
  const mockLoadFile = vi.fn().mockResolvedValue(undefined);
  const mockSetSize = vi.fn();
  const mockShow = vi.fn();
  const mockClose = vi.fn();
  const mockIsDestroyed = vi.fn(() => false);
  const mockSetAlwaysOnTop = vi.fn();

  function MockBrowserWindow(this: Record<string, unknown>) {
    this.loadURL = mockLoadURL;
    this.loadFile = mockLoadFile;
    this.show = mockShow;
    this.close = mockClose;
    this.setSize = mockSetSize;
    this.setAlwaysOnTop = mockSetAlwaysOnTop;
    this.setVisibleOnAllWorkspaces = vi.fn();
    this.isDestroyed = mockIsDestroyed;
    this.webContents = {
      send: mockSend,
      executeJavaScript: vi.fn().mockResolvedValue(300),
      isDestroyed: vi.fn(() => false),
    };
    // Capture handlers without invoking — allows deferred firing for race condition tests
    this._onceHandlers = new Map<string, () => void>();
    this._onHandlers = new Map<string, () => void>();
    this.once = vi.fn((event: string, cb: () => void) => {
      this._onceHandlers.set(event, cb);
    });
    this.on = vi.fn((event: string, cb: () => void) => {
      this._onHandlers.set(event, cb);
    });
  }

  return {
    BrowserWindow: vi.fn(MockBrowserWindow),
    app: { isPackaged: false },
  };
});

// Mock scheduler facade — alert-window calls cancelPendingBrowserOpen on user-dismissal
const mockCancelPendingBrowserOpen = vi.fn();
vi.mock("../../src/main/scheduler/facade.js", () => ({
  cancelPendingBrowserOpen: mockCancelPendingBrowserOpen,
}));


let showAlert: typeof import("../../src/main/windows/alert-window.js").showAlert;
import { BrowserWindow, app } from "electron";
import type { MeetingEvent } from "../../src/shared/meeting-event.js";
import { createMockEvent } from "../helpers/test-utils.js";

function makeEvent(overrides: Partial<MeetingEvent> = {}): MeetingEvent {
  return createMockEvent({ id: "test-1", ...overrides });
}

/** Get the nth BrowserWindow instance created (1-indexed) */
function getWindow(n: number): Record<string, unknown> {
  return vi.mocked(BrowserWindow).mock.results[n - 1].value as Record<
    string,
    unknown
  >;
}

/** Fire a captured event handler on a mock window instance */
function fireEvent(win: Record<string, unknown>, eventName: string): void {
  const onceHandlers = win._onceHandlers as unknown as Map<string, () => void>;
  const handler = onceHandlers.get(eventName);
  if (handler) {
    handler();
    onceHandlers.delete(eventName);
    return;
  }
  const onHandlers = win._onHandlers as unknown as Map<string, () => void>;
  const onHandler = onHandlers.get(eventName);
  if (onHandler) {
    onHandler();
  }
}

describe("alert-window", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();
    delete process.env.VITE_DEV_SERVER_URL;
    ({ showAlert } = await import("../../src/main/windows/alert-window.js"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("singleton behavior", () => {
    it("creates a new BrowserWindow on first call", () => {
      showAlert(makeEvent());
      expect(BrowserWindow).toHaveBeenCalledTimes(1);
    });

    it("passes correct BrowserWindow options", () => {
      showAlert(makeEvent());

      const options = vi.mocked(BrowserWindow).mock.calls[0][0]!;
      expect(options.width).toBe(500);
      expect(options.height).toBe(480);
      expect(options.resizable).toBe(false);
      expect(options.alwaysOnTop).toBe(true);
      expect(options.show).toBe(false);
      expect(options.webPreferences!.sandbox).toBe(true);
      expect(options.webPreferences!.contextIsolation).toBe(true);
      expect(options.webPreferences!.nodeIntegration).toBe(false);
    });

    it("queues subsequent alerts instead of creating a new window immediately", () => {
      showAlert(makeEvent({ id: "first" }));
      showAlert(makeEvent({ id: "second" }));

      // New behavior: second alert is queued, only one window created until first closes
      expect(BrowserWindow).toHaveBeenCalledTimes(1);
    });

    it("creates a second window after the first one closes", () => {
      showAlert(makeEvent({ id: "first" }));
      const win1 = getWindow(1);

      showAlert(makeEvent({ id: "second" }));
      // Second is queued, no new window yet
      expect(BrowserWindow).toHaveBeenCalledTimes(1);

      // Fire close on first, which triggers processNextAlert via setImmediate
      fireEvent(win1, "closed");
      vi.runAllTimers();

      expect(BrowserWindow).toHaveBeenCalledTimes(2);
    });
  });

  describe("dev vs production loading", () => {
    it("loads from dev server URL when VITE_DEV_SERVER_URL is set", () => {
      process.env.VITE_DEV_SERVER_URL = "http://localhost:5173";

      showAlert(makeEvent());

      const mockWin = getWindow(1);
      expect(mockWin.loadURL).toHaveBeenCalledWith(
        expect.stringContaining("/alert.html"),
      );
    });

    it("loads from file in production (no env var)", () => {
      (app as unknown as Record<string, unknown>).isPackaged = true;
      showAlert(makeEvent());
      (app as unknown as Record<string, unknown>).isPackaged = false;

      const mockWin = getWindow(1);
      expect(mockWin.loadFile).toHaveBeenCalledWith(
        expect.stringContaining("alert.html"),
      );
    });
  });

  describe("security", () => {
    it("always enables sandbox and context isolation", () => {
      showAlert(makeEvent());

      const options = vi.mocked(BrowserWindow).mock.calls[0][0]!;
      expect(options.webPreferences!.sandbox).toBe(true);
      expect(options.webPreferences!.contextIsolation).toBe(true);
      expect(options.webPreferences!.nodeIntegration).toBe(false);
    });
  });

  describe("race condition guards", () => {
    it("sends ALERT_SHOW via webContents when ready-to-show fires", () => {
      const mockSend = vi.fn();

      showAlert({ ...makeEvent(), id: "rc-1" });
      const win = getWindow(1);
      (win.webContents as { send: ReturnType<typeof vi.fn> }).send = mockSend;

      fireEvent(win, "ready-to-show");

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith(
        "alert:show",
        expect.objectContaining({ id: "rc-1" }),
      );
    });

    it("sends correct AlertPayload for event without meetUrl", () => {
      const mockSend = vi.fn();

      showAlert(makeEvent({ id: "no-url-event", meetUrl: undefined }));
      const win = getWindow(1);
      (win.webContents as { send: ReturnType<typeof vi.fn> }).send = mockSend;

      fireEvent(win, "ready-to-show");

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith(
        "alert:show",
        expect.objectContaining({ id: "no-url-event" }),
      );
      // Verify the payload does NOT include meetUrl (AlertPayload intentionally excludes it)
      const callArg = mockSend.mock.calls[0][1];
      expect(callArg).not.toHaveProperty("meetUrl");
    });

    it("does not crash when ready-to-show fires after window is destroyed", () => {
      const mockIsDestroyed = vi.fn(() => false);

      showAlert(makeEvent({ id: "destroyed-test" }));
      const win = getWindow(1);
      win.isDestroyed = mockIsDestroyed;

      // Window gets destroyed between registration and ready-to-show firing
      mockIsDestroyed.mockReturnValue(true);
      fireEvent(win, "ready-to-show");

      // webContents.send should NOT be called — guard bailed out
      expect(
        (win.webContents as { send: ReturnType<typeof vi.fn> }).send,
      ).not.toHaveBeenCalled();
    });

    it("processes the queued alert when the current window fires closed", () => {
      // New behavior: queued alerts are processed after the active window closes.
      const mockSend = vi.fn();

      // First alert — creates window A
      showAlert(makeEvent({ id: "race-a" }));
      const winA = getWindow(1);

      // Second alert — queued (no window B yet)
      showAlert(makeEvent({ id: "race-b" }));
      expect(BrowserWindow).toHaveBeenCalledTimes(1);

      // Window A closes — queue processes and creates window B via setImmediate
      fireEvent(winA, "closed");
      vi.runAllTimers();

      const winB = getWindow(2);
      (winB.webContents as { send: ReturnType<typeof vi.fn> }).send = mockSend;

      // Window B's ready-to-show should work normally
      fireEvent(winB, "ready-to-show");
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith(
        "alert:show",
        expect.objectContaining({ id: "race-b" }),
      );
    });

    it("does not execute JavaScript when window is destroyed before ready-to-show fires", () => {
      const mockExecuteJS = vi.fn().mockResolvedValue(300);

      showAlert(makeEvent({ id: "destroyed-before-ready" }));
      const win = getWindow(1);
      (
        win.webContents as { executeJavaScript: ReturnType<typeof vi.fn> }
      ).executeJavaScript = mockExecuteJS;

      // Window gets destroyed before ready-to-show fires
      win.isDestroyed = vi.fn(() => true);
      fireEvent(win, "ready-to-show");

      // executeJavaScript should NOT be called — guard bailed out
      expect(mockExecuteJS).not.toHaveBeenCalled();
    });

    it("shows window after successful height measurement", async () => {
      const mockShow = vi.fn();
      const mockSetSize = vi.fn();
      const mockExecuteJS = vi.fn().mockResolvedValue(350);

      showAlert(makeEvent({ id: "height-test" }));
      const win = getWindow(1);
      win.show = mockShow;
      win.setSize = mockSetSize;
      (
        win.webContents as { executeJavaScript: ReturnType<typeof vi.fn> }
      ).executeJavaScript = mockExecuteJS;

      fireEvent(win, "ready-to-show");

      // Advance past the 150ms setTimeout
      vi.advanceTimersByTime(150);

      // Flush the executeJavaScript promise
      await vi.runAllTimersAsync();

      // Height 350 should be clamped as-is (between 280 and 480)
      expect(mockSetSize).toHaveBeenCalledWith(500, 350, false);
      expect(mockShow).toHaveBeenCalled();
    });

    it("clamps height to MIN_HEIGHT when content is too small", async () => {
      const mockSetSize = vi.fn();
      const mockExecuteJS = vi.fn().mockResolvedValue(100);

      showAlert(makeEvent({ id: "min-height" }));
      const win = getWindow(1);
      win.setSize = mockSetSize;
      (
        win.webContents as { executeJavaScript: ReturnType<typeof vi.fn> }
      ).executeJavaScript = mockExecuteJS;

      fireEvent(win, "ready-to-show");
      vi.advanceTimersByTime(150);
      await vi.runAllTimersAsync();

      // 100 < 280 -> clamped to 280
      expect(mockSetSize).toHaveBeenCalledWith(500, 280, false);
    });

    it("clamps height to MAX_HEIGHT when content is too tall", async () => {
      const mockSetSize = vi.fn();
      const mockExecuteJS = vi.fn().mockResolvedValue(600);

      showAlert(makeEvent({ id: "max-height" }));
      const win = getWindow(1);
      win.setSize = mockSetSize;
      (
        win.webContents as { executeJavaScript: ReturnType<typeof vi.fn> }
      ).executeJavaScript = mockExecuteJS;

      fireEvent(win, "ready-to-show");
      vi.advanceTimersByTime(150);
      await vi.runAllTimersAsync();

      // 600 > 480 -> clamped to 480
      expect(mockSetSize).toHaveBeenCalledWith(500, 480, false);
    });

    it("shows window in catch when executeJavaScript rejects", async () => {
      const mockShow = vi.fn();
      const mockExecuteJS = vi.fn().mockRejectedValue(new Error("JS error"));

      showAlert(makeEvent({ id: "js-error" }));
      const win = getWindow(1);
      win.show = mockShow;
      (
        win.webContents as { executeJavaScript: ReturnType<typeof vi.fn> }
      ).executeJavaScript = mockExecuteJS;

      fireEvent(win, "ready-to-show");
      vi.advanceTimersByTime(150);
      await vi.runAllTimersAsync();

      expect(mockShow).toHaveBeenCalled();
    });

    it("does not show window in catch when window is destroyed", async () => {
      const mockShow = vi.fn();
      const mockExecuteJS = vi.fn().mockRejectedValue(new Error("JS error"));

      showAlert(makeEvent({ id: "catch-destroyed" }));
      const win = getWindow(1);
      win.show = mockShow;
      (
        win.webContents as { executeJavaScript: ReturnType<typeof vi.fn> }
      ).executeJavaScript = mockExecuteJS;

      fireEvent(win, "ready-to-show");
      vi.advanceTimersByTime(150);

      // Destroy before promise settles
      win.isDestroyed = vi.fn(() => true);
      await vi.runAllTimersAsync();

      expect(mockShow).not.toHaveBeenCalled();
    });

    it("nulls alertWindow when current window fires closed", () => {
      showAlert(makeEvent({ id: "close-current" }));
      const win = getWindow(1);

      // Fire closed on the current window — should null alertWindow
      fireEvent(win, "closed");

      // Create another alert — should create a new window (not reuse the nulled one)
      showAlert(makeEvent({ id: "after-close" }));
      expect(BrowserWindow).toHaveBeenCalledTimes(2);
    });
  describe("reschedule handling", () => {
    it("closes old window and queues new alert when same UID has different startMs", () => {
      const oldStart = "2026-05-11T10:00:00Z";
      showAlert(makeEvent({ id: "resched", startDate: oldStart }));
      const win1 = getWindow(1);
      win1.__alertStartMs = new Date(oldStart).getTime();
      const newStart = "2026-05-11T14:00:00Z";
      showAlert(makeEvent({ id: "resched", startDate: newStart }));
      expect(win1.close).toHaveBeenCalled();
      expect(BrowserWindow).toHaveBeenCalledTimes(1);
      fireEvent(win1, "closed");
      vi.runAllTimers();
      expect(BrowserWindow).toHaveBeenCalledTimes(2);
    });
    it("replaces queued entry when same UID with different startMs arrives", () => {
      showAlert(makeEvent({ id: "blocker" }));
      showAlert(makeEvent({ id: "queued", startDate: "2026-05-11T10:00:00Z" }));
      expect(BrowserWindow).toHaveBeenCalledTimes(1);
      showAlert(makeEvent({ id: "queued", startDate: "2026-05-11T14:00:00Z" }));
      expect(BrowserWindow).toHaveBeenCalledTimes(1);
      const win1 = getWindow(1);
      fireEvent(win1, "closed");
      vi.runAllTimers();
      expect(BrowserWindow).toHaveBeenCalledTimes(2);
      const win2 = getWindow(2);
      const mockSend = vi.fn();
      (win2.webContents as { send: ReturnType<typeof vi.fn> }).send = mockSend;
      fireEvent(win2, "ready-to-show");
      expect(mockSend).toHaveBeenCalledWith(
        "alert:show",
        expect.objectContaining({ id: "queued", startDate: "2026-05-11T14:00:00Z" }),
      );
    });
    it("still coalesces when same UID and same startMs are already showing", () => {
      const event = makeEvent({ id: "same", startDate: "2026-05-11T09:00:00Z" });
      showAlert(event);
      const win1 = getWindow(1);
      win1.__alertStartMs = new Date("2026-05-11T09:00:00Z").getTime();
      showAlert(event);
      expect(win1.close).not.toHaveBeenCalled();
      expect(BrowserWindow).toHaveBeenCalledTimes(1);
    });
    it("does not crash when old window is already destroyed on reschedule", () => {
      showAlert(makeEvent({ id: "dstr", startDate: "2026-05-11T10:00:00Z" }));
      const win1 = getWindow(1);
      win1.__alertStartMs = new Date("2026-05-11T10:00:00Z").getTime();
      win1.isDestroyed = vi.fn(() => true);
      expect(() => showAlert(makeEvent({ id: "dstr", startDate: "2026-05-11T14:00:00Z" }))).not.toThrow();
    });

    describe("closed-handler cancels pending browser-open (F1)", () => {
      it("cancels pending browser-open when user dismisses alert (no __replacing flag)", () => {
        showAlert(makeEvent({ id: "dismiss-me" }));
        const win = getWindow(1);
        fireEvent(win, "closed");
        expect(mockCancelPendingBrowserOpen).toHaveBeenCalledTimes(1);
        expect(mockCancelPendingBrowserOpen).toHaveBeenCalledWith("dismiss-me");
      });

      it("does NOT cancel browser-open when window is closed due to reschedule replacement", () => {
        showAlert(makeEvent({ id: "resched", startDate: "2026-05-11T10:00:00Z" }));
        const win1 = getWindow(1);
        win1.__alertStartMs = new Date("2026-05-11T10:00:00Z").getTime();
        // Reschedule — alert-window sets __replacing=true and closes win1
        showAlert(makeEvent({ id: "resched", startDate: "2026-05-11T14:00:00Z" }));
        // Fire the deferred closed handler on win1
        fireEvent(win1, "closed");
        expect(mockCancelPendingBrowserOpen).not.toHaveBeenCalled();
      });
    });
  });

  });
});
