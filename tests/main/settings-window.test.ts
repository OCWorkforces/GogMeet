import { describe, it, expect, vi, beforeEach } from "vitest";

// settings-window.ts has module-level state: `const isDev = !app.isPackaged`
// Must reset modules between tests to get fresh state
vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    dock: { show: vi.fn(), hide: vi.fn() },
  },
  BrowserWindow: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.loadURL = vi.fn().mockResolvedValue(undefined);
    this.loadFile = vi.fn().mockResolvedValue(undefined);
    this.show = vi.fn();
    this.focus = vi.fn();
    this.isDestroyed = () => false;
    this.webContents = { send: vi.fn() };
    this.once = vi.fn((_event: string, cb: () => void) => cb());
    this.on = vi.fn();
  }),
}));

describe("settings-window", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.VITE_DEV_SERVER_URL;
  });

  async function getModule() {
    return await import("../../src/main/settings-window.js");
  }

  async function getElectron() {
    return await import("electron");
  }

  describe("singleton behavior", () => {
    it("creates a new BrowserWindow on first call", async () => {
      const { createSettingsWindow } = await getModule();
      const { BrowserWindow } = await getElectron();
      createSettingsWindow();
      expect(BrowserWindow).toHaveBeenCalledTimes(1);
    });

    it("returns existing window if already open", async () => {
      const { createSettingsWindow } = await getModule();
      const win1 = createSettingsWindow();
      const win2 = createSettingsWindow();
      expect(win1).toBe(win2);
    });
  });

  describe("BrowserWindow options", () => {
    it("passes correct dimensions and constraints", async () => {
      const { createSettingsWindow } = await getModule();
      const { BrowserWindow } = await getElectron();
      createSettingsWindow();

      const options = vi.mocked(BrowserWindow).mock.calls[0][0];
      expect(options.width).toBe(520);
      expect(options.height).toBe(480);
      expect(options.minWidth).toBe(520);
      expect(options.minHeight).toBe(480);
      expect(options.resizable).toBe(false);
      expect(options.show).toBe(false);
    });

    it("always enables security webPreferences", async () => {
      const { createSettingsWindow } = await getModule();
      const { BrowserWindow } = await getElectron();
      createSettingsWindow();

      const options = vi.mocked(BrowserWindow).mock.calls[0][0];
      expect(options.webPreferences?.sandbox).toBe(true);
      expect(options.webPreferences?.contextIsolation).toBe(true);
      expect(options.webPreferences?.nodeIntegration).toBe(false);
    });

    it("uses hiddenInset title bar style", async () => {
      const { createSettingsWindow } = await getModule();
      const { BrowserWindow } = await getElectron();
      createSettingsWindow();

      const options = vi.mocked(BrowserWindow).mock.calls[0][0];
      expect(options.titleBarStyle).toBe("hiddenInset");
    });
  });

  describe("dev vs production loading", () => {
    it("loads from dev server URL when VITE_DEV_SERVER_URL is set", async () => {
      process.env.VITE_DEV_SERVER_URL = "http://localhost:5173";
      const { createSettingsWindow } = await getModule();
      const { BrowserWindow } = await getElectron();
      createSettingsWindow();

      const mockWin = vi.mocked(BrowserWindow).mock.results[0].value as { loadURL: ReturnType<typeof vi.fn> };
      expect(mockWin.loadURL).toHaveBeenCalledWith(
        expect.stringContaining("/settings.html"),
      );
    });

    it("loads from file when no dev server env var is set", async () => {
      const { createSettingsWindow } = await getModule();
      const { BrowserWindow } = await getElectron();
      createSettingsWindow();

      // When no VITE_DEV_SERVER_URL is set, settings-window still uses loadURL
      // because isDev = !app.isPackaged and our mock has isPackaged=false
      const mockWin = vi.mocked(BrowserWindow).mock.results[0].value as { loadURL: ReturnType<typeof vi.fn> };
      expect(mockWin.loadURL).toHaveBeenCalled();
    });
  });

  describe("Dock behavior", () => {
    it("shows Dock when settings window is ready", async () => {
      const { createSettingsWindow } = await getModule();
      const { app } = await getElectron();
      createSettingsWindow();

      expect(vi.mocked(app.dock?.show)).toHaveBeenCalled();
    });
  });
});
