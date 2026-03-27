import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock electron before importing alert-window — must use function keyword for constructor
vi.mock("electron", () => {
  const mockSend = vi.fn();
  const mockOn = vi.fn();
  const mockOnce = vi.fn((_event: string, cb: () => void) => {
    cb();
  });
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
    this.once = mockOnce;
    this.on = mockOn;
  }

  return {
    BrowserWindow: vi.fn(MockBrowserWindow),
  };
});

import { showAlert } from "../../src/main/alert-window.js";
import { BrowserWindow } from "electron";

describe("alert-window", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.VITE_DEV_SERVER_URL;
  });

  describe("singleton behavior", () => {
    it("creates a new BrowserWindow on first call", () => {
      showAlert({
        id: "test-1",
        title: "Test Meeting",
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        calendarName: "Work",
        isAllDay: false,
        meetUrl: "https://meet.google.com/abc-def-ghi",
      });

      expect(BrowserWindow).toHaveBeenCalledTimes(1);
    });

    it("passes correct BrowserWindow options", () => {
      showAlert({
        id: "test-2",
        title: "Test",
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        calendarName: "Work",
        isAllDay: false,
      });

      const options = vi.mocked(BrowserWindow).mock.calls[0][0];
      expect(options.width).toBe(500);
      expect(options.height).toBe(480);
      expect(options.resizable).toBe(false);
      expect(options.alwaysOnTop).toBe(true);
      expect(options.show).toBe(false);
      expect(options.webPreferences?.sandbox).toBe(true);
      expect(options.webPreferences?.contextIsolation).toBe(true);
      expect(options.webPreferences?.nodeIntegration).toBe(false);
    });

    it("closes existing alert before creating new one", () => {
      showAlert({
        id: "test-3",
        title: "First",
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        calendarName: "Work",
        isAllDay: false,
      });

      showAlert({
        id: "test-4",
        title: "Second",
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        calendarName: "Work",
        isAllDay: false,
      });

      expect(BrowserWindow).toHaveBeenCalledTimes(2);
    });
  });

  describe("dev vs production loading", () => {
    it("loads from dev server URL when VITE_DEV_SERVER_URL is set", () => {
      process.env.VITE_DEV_SERVER_URL = "http://localhost:5173";

      showAlert({
        id: "test-5",
        title: "Dev Test",
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        calendarName: "Work",
        isAllDay: false,
      });

      const mockWin = vi.mocked(BrowserWindow).mock.results[0].value as {
        loadURL: ReturnType<typeof vi.fn>;
      };
      expect(mockWin.loadURL).toHaveBeenCalledWith(
        expect.stringContaining("/alert.html"),
      );
    });

    it("loads from file in production (no env var)", () => {
      showAlert({
        id: "test-6",
        title: "Prod Test",
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        calendarName: "Work",
        isAllDay: false,
      });

      const mockWin = vi.mocked(BrowserWindow).mock.results[0].value as {
        loadFile: ReturnType<typeof vi.fn>;
      };
      expect(mockWin.loadFile).toHaveBeenCalledWith(
        expect.stringContaining("alert.html"),
      );
    });
  });

  describe("security", () => {
    it("always enables sandbox and context isolation", () => {
      showAlert({
        id: "test-7",
        title: "Security Test",
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        calendarName: "Work",
        isAllDay: false,
      });

      const options = vi.mocked(BrowserWindow).mock.calls[0][0];
      expect(options.webPreferences?.sandbox).toBe(true);
      expect(options.webPreferences?.contextIsolation).toBe(true);
      expect(options.webPreferences?.nodeIntegration).toBe(false);
    });
  });
});
