import { describe, it, expect, vi, beforeEach } from "vitest";

// Bare "/app" does not round-trip through fileURLToPath on Windows.
const { MOCK_APP_PATH } = vi.hoisted(() => ({
  MOCK_APP_PATH: process.platform === "win32" ? "C:\\app" : "/app",
}));

// settings-window.ts has module-level state: `const isDev = !app.isPackaged`
// Must reset modules between tests to get fresh state.
// On Windows, createSettingsWindow → bindWindowsThemeBackground registers
// nativeTheme listeners (Darwin short-circuits). The electron mock must export
// nativeTheme or win32 CI fails with "No nativeTheme export".
vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    dock: { show: vi.fn(), hide: vi.fn() },
    getAppPath: vi.fn().mockReturnValue(MOCK_APP_PATH),
  },
  nativeTheme: {
    shouldUseDarkColors: false,
    on: vi.fn(),
    removeListener: vi.fn(),
  },
  BrowserWindow: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.loadURL = vi.fn().mockResolvedValue(undefined);
    this.loadFile = vi.fn().mockResolvedValue(undefined);
    this.show = vi.fn();
    this.hide = vi.fn();
    this.focus = vi.fn();
    this.destroy = vi.fn();
    this.isDestroyed = () => false;
    this.isVisible = vi.fn().mockReturnValue(true);
    this.setBackgroundColor = vi.fn();
    this.webContents = {
      send: vi.fn(),
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    };
    this.once = vi.fn((_event: string, cb: () => void) => cb());
    this.on = vi.fn();
    this.__forceDestroy = false;
  }),
  session: {
    defaultSession: {
      webRequest: { onHeadersReceived: vi.fn() },
    },
  },
}));

describe("settings-window", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.VITE_DEV_SERVER_URL;
  });

  async function getModule() {
    return await import("../../src/main/windows/settings-window.js");
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
      expect(options.height).toBe(760);
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

    it("applies platform chrome (mac title bar / Windows opaque)", async () => {
      const { createSettingsWindow } = await getModule();
      const { BrowserWindow } = await getElectron();
      createSettingsWindow();

      const options = vi.mocked(BrowserWindow).mock.calls[0][0];
      // platformWindowChrome("settings"): hiddenInset vibrancy on Darwin;
      // opaque backgroundColor only on Windows.
      if (process.platform === "darwin") {
        expect(options.titleBarStyle).toBe("hiddenInset");
        expect(options.backgroundColor).toBe("#0d1117");
        expect(options.vibrancy).toBeUndefined();
      } else {
        expect(options.titleBarStyle).toBeUndefined();
        expect(options.backgroundColor).toBe("#0d1117");
      }
    });

    it("has alwaysOnTop enabled", async () => {
      const { createSettingsWindow } = await getModule();
      const { BrowserWindow } = await getElectron();
      createSettingsWindow();

      const options = vi.mocked(BrowserWindow).mock.calls[0][0];
      expect(options.alwaysOnTop).toBe(true);
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

  describe("hide-cache reuse", () => {
    it("re-presents the same window after hide without reloading", async () => {
      const { createSettingsWindow } = await getModule();
      const { BrowserWindow, app } = await getElectron();
      const win1 = createSettingsWindow();
      const mockWin = vi.mocked(BrowserWindow).mock.results[0]?.value as {
        hide: ReturnType<typeof vi.fn>;
        show: ReturnType<typeof vi.fn>;
        focus: ReturnType<typeof vi.fn>;
        isVisible: ReturnType<typeof vi.fn>;
        loadURL: ReturnType<typeof vi.fn>;
        on: ReturnType<typeof vi.fn>;
      };

      // Simulate user close → hide-cache
      const closeHandler = mockWin.on.mock.calls.find((c) => c[0] === "close")?.[1] as
        | ((e: { preventDefault: () => void }) => void)
        | undefined;
      expect(closeHandler).toBeTypeOf("function");
      const event = { preventDefault: vi.fn() };
      closeHandler?.(event);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(mockWin.hide).toHaveBeenCalled();
      expect(vi.mocked(app.dock?.hide)).toHaveBeenCalled();

      mockWin.isVisible.mockReturnValue(false);
      mockWin.show.mockClear();
      mockWin.focus.mockClear();
      const loadCalls = mockWin.loadURL.mock.calls.length;

      const win2 = createSettingsWindow();
      expect(win2).toBe(win1);
      expect(BrowserWindow).toHaveBeenCalledTimes(1);
      expect(mockWin.show).toHaveBeenCalled();
      expect(mockWin.focus).toHaveBeenCalled();
      expect(mockWin.loadURL.mock.calls.length).toBe(loadCalls);
    });

    it("force-destroys on destroySettingsWindow", async () => {
      const { createSettingsWindow, destroySettingsWindow } = await getModule();
      const { BrowserWindow } = await getElectron();
      createSettingsWindow();
      const mockWin = vi.mocked(BrowserWindow).mock.results[0]?.value as {
        destroy: ReturnType<typeof vi.fn>;
        __forceDestroy?: boolean;
      };
      destroySettingsWindow();
      expect(mockWin.__forceDestroy).toBe(true);
      expect(mockWin.destroy).toHaveBeenCalled();
    });

    it("supports multiple hide/show cycles without new BrowserWindow", async () => {
      const { createSettingsWindow } = await getModule();
      const { BrowserWindow } = await getElectron();
      createSettingsWindow();
      const mockWin = vi.mocked(BrowserWindow).mock.results[0]?.value as {
        hide: ReturnType<typeof vi.fn>;
        show: ReturnType<typeof vi.fn>;
        isVisible: ReturnType<typeof vi.fn>;
        on: ReturnType<typeof vi.fn>;
        loadURL: ReturnType<typeof vi.fn>;
      };
      const closeHandler = mockWin.on.mock.calls.find((c) => c[0] === "close")?.[1] as
        | ((e: { preventDefault: () => void }) => void)
        | undefined;
      const loadCalls = mockWin.loadURL.mock.calls.length;

      for (let i = 0; i < 3; i++) {
        closeHandler?.({ preventDefault: vi.fn() });
        mockWin.isVisible.mockReturnValue(false);
        mockWin.show.mockClear();
        createSettingsWindow();
        expect(mockWin.show).toHaveBeenCalled();
      }
      expect(BrowserWindow).toHaveBeenCalledTimes(1);
      expect(mockWin.loadURL.mock.calls.length).toBe(loadCalls);
    });

    it("creates a new window after force destroy", async () => {
      const { createSettingsWindow, destroySettingsWindow } = await getModule();
      const { BrowserWindow } = await getElectron();
      createSettingsWindow();
      destroySettingsWindow();
      // Simulate destroyed singleton cleared
      const first = vi.mocked(BrowserWindow).mock.results[0]?.value as {
        isDestroyed: () => boolean;
      };
      // Module already nulls ref on destroySettingsWindow
      createSettingsWindow();
      expect(BrowserWindow).toHaveBeenCalledTimes(2);
      void first;
    });

    it("allows close to proceed when __forceDestroy is set", async () => {
      const { createSettingsWindow } = await getModule();
      const { BrowserWindow } = await getElectron();
      createSettingsWindow();
      const mockWin = vi.mocked(BrowserWindow).mock.results[0]?.value as {
        on: ReturnType<typeof vi.fn>;
        hide: ReturnType<typeof vi.fn>;
        __forceDestroy?: boolean;
      };
      const closeHandler = mockWin.on.mock.calls.find((c) => c[0] === "close")?.[1] as
        | ((e: { preventDefault: () => void }) => void)
        | undefined;
      mockWin.__forceDestroy = true;
      mockWin.hide.mockClear();
      const event = { preventDefault: vi.fn() };
      closeHandler?.(event);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(mockWin.hide).not.toHaveBeenCalled();
    });

    it("exposes getSettingsWindow and clears it on closed", async () => {
      const { createSettingsWindow, getSettingsWindow, destroySettingsWindow } = await getModule();
      const { BrowserWindow } = await getElectron();
      expect(getSettingsWindow()).toBeNull();
      const win = createSettingsWindow();
      expect(getSettingsWindow()).toBe(win);

      const mockWin = vi.mocked(BrowserWindow).mock.results[0]?.value as {
        on: ReturnType<typeof vi.fn>;
        isDestroyed: () => boolean;
      };
      const closedHandler = mockWin.on.mock.calls.find((c) => c[0] === "closed")?.[1] as
        | (() => void)
        | undefined;
      closedHandler?.();
      expect(getSettingsWindow()).toBeNull();

      createSettingsWindow();
      destroySettingsWindow();
      expect(getSettingsWindow()).toBeNull();
    });

    it("skips present when window is destroyed", async () => {
      const { createSettingsWindow } = await getModule();
      const { BrowserWindow } = await getElectron();
      createSettingsWindow();
      const mockWin = vi.mocked(BrowserWindow).mock.results[0]?.value as {
        isDestroyed: ReturnType<typeof vi.fn>;
        once: ReturnType<typeof vi.fn>;
        show: ReturnType<typeof vi.fn>;
      };
      // ready-to-show already fired in constructor mock; simulate destroyed present via close hide then isDestroyed true
      mockWin.isDestroyed = vi.fn().mockReturnValue(true);
      mockWin.show.mockClear();
      // Second create with destroyed flag still true on same ref should create new if module checks isDestroyed
      // Module still holds settingsWindow with isDestroyed true → create new
      createSettingsWindow();
      expect(BrowserWindow).toHaveBeenCalledTimes(2);
    });
  });
});
