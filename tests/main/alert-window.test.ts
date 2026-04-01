import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock electron before importing alert-window — must use function keyword for constructor
vi.mock("electron", () => {
  const mockSend = vi.fn();
  const mockLoadURL = vi.fn();
  const mockLoadFile = vi.fn();
  const mockSetSize = vi.fn();
  const mockShow = vi.fn();
  const mockClose = vi.fn();
  const mockIsDestroyed = vi.fn(() => false);

  function MockBrowserWindow(this: Record<string, unknown>) {
    this.loadURL = mockLoadURL;
    this.loadFile = mockLoadFile;
    this.show = mockShow;
    this.close = mockClose;
    this.setSize = mockSetSize;
    this.isDestroyed = mockIsDestroyed;
    this.webContents = {
      send: mockSend,
      executeJavaScript: vi.fn().mockResolvedValue(300),
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

import { showAlert } from "../../src/main/alert-window.js";
import { BrowserWindow, app } from "electron";

function makeEvent(overrides: Partial<{ id: string; title: string }> = {}) {
  return {
    id: overrides.id ?? "test-1",
    title: overrides.title ?? "Test Meeting",
    startDate: new Date().toISOString(),
    endDate: new Date().toISOString(),
    calendarName: "Work",
    isAllDay: false,
    meetUrl: "https://meet.google.com/abc-def-ghi",
  };
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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    delete process.env.VITE_DEV_SERVER_URL;
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

    it("closes existing alert before creating new one", () => {
      showAlert(makeEvent({ id: "first" }));
      showAlert(makeEvent({ id: "second" }));

      const win1 = getWindow(1);
      expect(win1.close).toHaveBeenCalled();
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

    it("does not crash when old window closed handler fires after new window is created", () => {
      // This is the core race condition: showAlert(A) -> showAlert(B) -> A's 'closed' fires
      // The old closed handler must not null out alertWindow when it points to window B.
      const mockSend = vi.fn();

      // First alert — creates window A
      showAlert(makeEvent({ id: "race-a" }));
      const winA = getWindow(1);

      // Second alert — closes window A, creates window B
      showAlert(makeEvent({ id: "race-b" }));
      const winB = getWindow(2);
      (winB.webContents as { send: ReturnType<typeof vi.fn> }).send = mockSend;

      // Old window A's 'closed' handler fires AFTER window B was already assigned
      // This must NOT null out alertWindow (which now points to B)
      fireEvent(winA, "closed");

      // Window B's ready-to-show should still work
      fireEvent(winB, "ready-to-show");
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith(
        "alert:show",
        expect.objectContaining({ id: "race-b" }),
      );
    });

    it("does not execute JavaScript when window is destroyed before setTimeout fires", () => {
      const mockExecuteJS = vi.fn().mockResolvedValue(300);

      showAlert(makeEvent({ id: "timeout-destroyed" }));
      const win = getWindow(1);
      (
        win.webContents as { executeJavaScript: ReturnType<typeof vi.fn> }
      ).executeJavaScript = mockExecuteJS;
      win.isDestroyed = vi.fn(() => false);

      // Fire ready-to-show — this registers the setTimeout
      fireEvent(win, "ready-to-show");

      // Window gets destroyed before the 150ms timeout fires
      (win.isDestroyed as ReturnType<typeof vi.fn>).mockReturnValue(true);
      vi.advanceTimersByTime(150);

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
  });
});
