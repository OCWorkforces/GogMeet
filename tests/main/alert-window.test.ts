import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock electron before importing alert-window — must use function keyword for constructor
vi.mock("electron", () => {
  const mockSend = vi.fn();
  const mockLoadURL = vi.fn().mockResolvedValue(undefined);
  const mockLoadFile = vi.fn().mockResolvedValue(undefined);
  const mockSetSize = vi.fn();
  const mockShow = vi.fn();
  const mockHide = vi.fn();
  const mockClose = vi.fn();
  const mockDestroy = vi.fn();
  const mockIsDestroyed = vi.fn(() => false);
  const mockIsVisible = vi.fn(() => true);
  const mockSetAlwaysOnTop = vi.fn();

  function MockBrowserWindow(this: Record<string, unknown>) {
    this.loadURL = mockLoadURL;
    this.loadFile = mockLoadFile;
    this.show = mockShow;
    this.hide = mockHide;
    this.close = mockClose;
    this.destroy = mockDestroy;
    this.setSize = mockSetSize;
    this.setAlwaysOnTop = mockSetAlwaysOnTop;
    this.setVisibleOnAllWorkspaces = vi.fn();
    this.isDestroyed = mockIsDestroyed;
    this.isVisible = mockIsVisible;
    this.webContents = {
      send: mockSend,
      executeJavaScript: vi.fn().mockResolvedValue(300),
      isDestroyed: vi.fn(() => false),
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    };
    // Capture handlers without invoking — allows deferred firing for race condition tests
    this._onceHandlers = new Map<string, (...args: unknown[]) => void>();
    this._onHandlers = new Map<string, (...args: unknown[]) => void>();
    this.once = vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      this._onceHandlers.set(event, cb);
    });
    this.on = vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      this._onHandlers.set(event, cb);
    });
  }

  return {
    BrowserWindow: vi.fn(MockBrowserWindow),
    app: { isPackaged: false, getAppPath: vi.fn().mockReturnValue("/app") },
    session: {
      defaultSession: {
        webRequest: { onHeadersReceived: vi.fn() },
      },
    },
  };
});

// Mock scheduler facade — alert-window calls cancelPendingBrowserOpen on user-dismissal
const mockCancelPendingBrowserOpen = vi.fn();
vi.mock("../../src/main/scheduler/facade.js", () => ({
  cancelPendingBrowserOpen: mockCancelPendingBrowserOpen,
}));


let showAlert: typeof import("../../src/main/windows/alert-window.js").showAlert;
let destroyAlertWindow: typeof import("../../src/main/windows/alert-window.js").destroyAlertWindow;
import { BrowserWindow, app } from "electron";
import type { MeetingEvent } from "../../src/domain/entities/meeting-event.js";
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
  const onceHandlers = win._onceHandlers.As<Map<string, (...args: unknown[]) => void>>();
  const handler = onceHandlers.get(eventName);
  if (handler) {
    handler();
    onceHandlers.delete(eventName);
    return;
  }
  const onHandlers = win._onHandlers.As<Map<string, (...args: unknown[]) => void>>();
  const onHandler = onHandlers.get(eventName);
  if (onHandler) {
    if (eventName === "close") {
      onHandler({ preventDefault: vi.fn() });
    } else {
      onHandler();
    }
  }
}

describe("alert-window", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();
    delete process.env.VITE_DEV_SERVER_URL;
    ({ showAlert, destroyAlertWindow } = await import(
      "../../src/main/windows/alert-window.js"
    ));
  });

  afterEach(() => {
    destroyAlertWindow();
    vi.useRealTimers();
  });

  describe("singleton behavior", () => {
    it("creates a new BrowserWindow on first call", () => {
      showAlert(makeEvent());
      expect(BrowserWindow).toHaveBeenCalledTimes(1);
    });

    it("force-destroys the window via destroyAlertWindow", () => {
      showAlert(makeEvent({ id: "force-destroy" }));
      const win = getWindow(1);
      destroyAlertWindow();
      expect(win.__forceDestroy).toBe(true);
      expect(win.destroy).toHaveBeenCalled();
      // Safe to call again when nothing is showing
      expect(() => destroyAlertWindow()).not.toThrow();
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

    it("reuses the hidden window for the next alert after dismiss", async () => {
      showAlert(makeEvent({ id: "first" }));
      const win1 = getWindow(1);

      showAlert(makeEvent({ id: "second" }));
      // Second is queued, no new window yet
      expect(BrowserWindow).toHaveBeenCalledTimes(1);

      // User dismiss: close is prevented → hide → processNextAlert reuses win1
      fireEvent(win1, "close");
      await vi.runAllTimersAsync();

      expect(BrowserWindow).toHaveBeenCalledTimes(1);
      expect(win1.hide).toHaveBeenCalled();
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
      (app.As<Record<string, unknown>>()).isPackaged = true;
      showAlert(makeEvent());
      (app.As<Record<string, unknown>>()).isPackaged = false;

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

    it("processes the queued alert by reusing the window after dismiss", async () => {
      const mockSend = vi.fn();

      // First alert — creates window A
      showAlert(makeEvent({ id: "race-a" }));
      const winA = getWindow(1);
      (winA.webContents as { send: ReturnType<typeof vi.fn> }).send = mockSend;

      // Second alert — queued (no second BrowserWindow)
      showAlert(makeEvent({ id: "race-b" }));
      expect(BrowserWindow).toHaveBeenCalledTimes(1);

      // Dismiss A — hide + reuse for B
      fireEvent(winA, "close");
      await vi.runAllTimersAsync();

      expect(BrowserWindow).toHaveBeenCalledTimes(1);
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

    it("nulls alertWindow when current window fires closed (true destroy)", () => {
      showAlert(makeEvent({ id: "close-current" }));
      const win = getWindow(1);

      // Real destroy path (e.g. force-destroy) — closed fires and nulls the ref
      fireEvent(win, "closed");

      // Create another alert — should create a new window (not reuse the nulled one)
      showAlert(makeEvent({ id: "after-close" }));
      expect(BrowserWindow).toHaveBeenCalledTimes(2);
    });
  });

  describe("reschedule handling", () => {
    it("reuses the same window when same UID has different startMs", async () => {
      const oldStart = "2026-05-11T10:00:00Z";
      showAlert(makeEvent({ id: "resched", startDate: oldStart }));
      const win1 = getWindow(1);
      win1.__alertStartMs = new Date(oldStart).getTime();
      const mockSend = vi.fn();
      (win1.webContents as { send: ReturnType<typeof vi.fn> }).send = mockSend;
      const newStart = "2026-05-11T14:00:00Z";
      showAlert(makeEvent({ id: "resched", startDate: newStart }));
      // In-place reuse — no second BrowserWindow, no close/destroy
      expect(win1.close).not.toHaveBeenCalled();
      expect(BrowserWindow).toHaveBeenCalledTimes(1);
      await vi.runAllTimersAsync();
      expect(mockSend).toHaveBeenCalledWith(
        "alert:show",
        expect.objectContaining({ id: "resched", startDate: newStart }),
      );
    });
    it("replaces queued entry when same UID with different startMs arrives", async () => {
      showAlert(makeEvent({ id: "blocker" }));
      showAlert(makeEvent({ id: "queued", startDate: "2026-05-11T10:00:00Z" }));
      expect(BrowserWindow).toHaveBeenCalledTimes(1);
      showAlert(makeEvent({ id: "queued", startDate: "2026-05-11T14:00:00Z" }));
      expect(BrowserWindow).toHaveBeenCalledTimes(1);
      const win1 = getWindow(1);
      const mockSend = vi.fn();
      (win1.webContents as { send: ReturnType<typeof vi.fn> }).send = mockSend;
      fireEvent(win1, "close");
      await vi.runAllTimersAsync();
      expect(BrowserWindow).toHaveBeenCalledTimes(1);
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
      expect(() =>
        showAlert(makeEvent({ id: "dstr", startDate: "2026-05-11T14:00:00Z" })),
      ).not.toThrow();
    });

    describe("close-handler cancels pending browser-open", () => {
      it("cancels pending browser-open when user dismisses alert", () => {
        showAlert(makeEvent({ id: "dismiss-me" }));
        const win = getWindow(1);
        fireEvent(win, "close");
        expect(mockCancelPendingBrowserOpen).toHaveBeenCalledTimes(1);
        expect(mockCancelPendingBrowserOpen).toHaveBeenCalledWith("dismiss-me");
      });

      it("does NOT cancel browser-open when reschedule reuses the window", () => {
        showAlert(makeEvent({ id: "resched", startDate: "2026-05-11T10:00:00Z" }));
        const win1 = getWindow(1);
        win1.__alertStartMs = new Date("2026-05-11T10:00:00Z").getTime();
        showAlert(makeEvent({ id: "resched", startDate: "2026-05-11T14:00:00Z" }));
        // No close path — reuse only
        expect(mockCancelPendingBrowserOpen).not.toHaveBeenCalled();
        expect(win1.close).not.toHaveBeenCalled();
      });
    });
  });
});
