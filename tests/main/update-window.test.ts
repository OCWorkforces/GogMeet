import { describe, it, expect, vi, beforeEach } from "vitest";

type WebContentsMock = {
  send: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  setWindowOpenHandler: ReturnType<typeof vi.fn>;
  executeJavaScript: ReturnType<typeof vi.fn>;
  isDestroyed: ReturnType<typeof vi.fn>;
};

type WindowMock = {
  loadURL: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  setSize: ReturnType<typeof vi.fn>;
  isDestroyed: ReturnType<typeof vi.fn>;
  isVisible: ReturnType<typeof vi.fn>;
  webContents: WebContentsMock;
  once: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  __forceDestroy?: boolean;
};

const windowInstances: WindowMock[] = [];

vi.mock("electron", () => ({
  app: {
    getVersion: vi.fn().mockReturnValue("1.18.3"),
    getName: vi.fn().mockReturnValue("GogMeet"),
    getAppPath: vi.fn().mockReturnValue("/app"),
    isPackaged: false,
  },
  BrowserWindow: vi.fn().mockImplementation(function (this: WindowMock) {
    this.loadURL = vi.fn().mockResolvedValue(undefined);
    this.show = vi.fn();
    this.hide = vi.fn();
    this.focus = vi.fn();
    this.close = vi.fn();
    this.destroy = vi.fn();
    this.setSize = vi.fn();
    this.isDestroyed = vi.fn().mockReturnValue(false);
    this.isVisible = vi.fn().mockReturnValue(true);
    this.webContents = {
      send: vi.fn(),
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      executeJavaScript: vi.fn().mockResolvedValue(undefined),
      isDestroyed: vi.fn().mockReturnValue(false),
    };
    this.once = vi.fn();
    this.on = vi.fn();
    windowInstances.push(this);
  }),
}));

vi.mock("node:fs", () => ({
  readFileSync: vi.fn().mockReturnValue("<svg></svg>"),
}));

vi.mock("../../src/main/utils/window-chrome.js", () => ({
  platformWindowChrome: vi.fn().mockReturnValue({
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0d1117",
  }),
  bindWindowsThemeBackground: vi.fn().mockReturnValue(() => undefined),
}));

vi.mock("../../src/main/windows/dock-visibility.js", () => ({
  acquireDockVisibility: vi.fn(),
  releaseDockVisibility: vi.fn(),
}));

describe("update-window", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    windowInstances.length = 0;
  });

  async function getModule() {
    return await import("../../src/main/windows/update-window.js");
  }

  async function getElectron() {
    return await import("electron");
  }

  function getWebContentsHandlers(win: WindowMock): Map<string, (...args: unknown[]) => void> {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    for (const call of win.webContents.on.mock.calls) {
      const [event, handler] = call as [string, (...args: unknown[]) => void];
      handlers.set(event, handler);
    }
    return handlers;
  }

  function getWindowHandlers(win: WindowMock): Map<string, (...args: unknown[]) => void> {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    for (const call of win.on.mock.calls) {
      const [event, handler] = call as [string, (...args: unknown[]) => void];
      handlers.set(event, handler);
    }
    return handlers;
  }

  it("creates a BrowserWindow with update chrome and aurora markup", async () => {
    const { presentUpdateDialog } = await getModule();
    const { BrowserWindow } = await getElectron();

    const pending = presentUpdateDialog({
      message: "GogMeet is up to date (v1.18.3)",
      // Dismiss-only — no OK button
      buttons: [],
    });

    await vi.waitFor(() => {
      expect(windowInstances.length).toBe(1);
      expect(windowInstances[0]?.loadURL).toHaveBeenCalled();
    });

    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    expect(BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 340,
        height: 340, // dismiss-only: no footer button
        alwaysOnTop: false,
        resizable: false,
      }),
    );

    const win = windowInstances[0]!;
    const url = String(win.loadURL.mock.calls[0]?.[0] ?? "");
    expect(url.startsWith("data:text/html")).toBe(true);
    const html = decodeURIComponent(url.replace(/^data:text\/html;charset=utf-8,/, ""));
    expect(html).toContain("app-icon-aurora");
    expect(html).toContain("app-icon-aurora--about");
    expect(html).toContain("app-icon-aurora--update");
    expect(html).toContain("You’re up to date");
    expect(html).toContain("GogMeet is up to date (v1.18.3)");
    expect(html).not.toContain("update-btn-0");
    expect(html).not.toContain('id="update-close"');
    expect(html).not.toContain(">OK<");
    expect(html).not.toContain(">Close<");
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Press Esc to close");
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("script-src 'none'");

    // Dismiss via Escape.
    const input = getWebContentsHandlers(win).get("before-input-event");
    expect(input).toBeDefined();
    input!(undefined, { type: "keyDown", key: "Escape" });
    await expect(pending).resolves.toEqual({ response: 0 });
  });

  it("checking phase returns immediately and keeps the window open", async () => {
    const { presentUpdateDialog, isUpdateDialogOpen } = await getModule();

    const result = await presentUpdateDialog({
      message: "Checking for Updates…",
      detail: "Looking for a newer version of GogMeet.",
      buttons: [],
      phase: "checking",
    });

    expect(result).toEqual({ response: -1 });
    expect(isUpdateDialogOpen()).toBe(true);
    const win = windowInstances[0];
    expect(win?.show).toHaveBeenCalled();
    const url = String(win?.loadURL.mock.calls[0]?.[0] ?? "");
    const html = decodeURIComponent(url.replace(/^data:text\/html;charset=utf-8,/, ""));
    expect(html).toContain('data-phase="checking"');
    expect(html).toContain("app-icon-aurora-bloom-in");
  });

  it("action sentinel resolves the matching button index", async () => {
    const { presentUpdateDialog } = await getModule();
    const pending = presentUpdateDialog({
      message: "Version 2.0.0 is ready to install",
      buttons: ["Restart Now", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    await vi.waitFor(() => {
      expect(windowInstances[0]?.loadURL).toHaveBeenCalled();
    });
    const win = windowInstances[0]!;
    await vi.waitFor(() => {
      expect(win.setSize).toHaveBeenCalledWith(340, 400);
    });
    const nav = getWebContentsHandlers(win).get("will-navigate");
    expect(nav).toBeDefined();
    nav!({ preventDefault: () => undefined, url: "https://gogmeet.local/__update_action__/1" });
    await expect(pending).resolves.toEqual({ response: 1 });
    expect(win.hide).toHaveBeenCalled();
  });

  it("Escape / close settles with cancelId and marks session dismissed during checking", async () => {
    const { presentUpdateDialog, isUpdateSessionDismissed, beginUpdateDialogSession } =
      await getModule();
    beginUpdateDialogSession();
    await presentUpdateDialog({
      message: "Checking for Updates…",
      buttons: [],
      phase: "checking",
    });
    const win = windowInstances[0]!;
    const input = getWebContentsHandlers(win).get("before-input-event");
    input?.(undefined, { type: "keyDown", key: "Escape" });
    expect(isUpdateSessionDismissed()).toBe(true);
    expect(win.hide).toHaveBeenCalled();
  });

  it("destroyUpdateWindow force-destroys and unblocks waiters", async () => {
    const { presentUpdateDialog, destroyUpdateWindow } = await getModule();
    const pending = presentUpdateDialog({
      message: "GogMeet is up to date",
      buttons: [],
    });
    await vi.waitFor(() => {
      expect(windowInstances[0]?.loadURL).toHaveBeenCalled();
    });
    const win = windowInstances[0]!;
    destroyUpdateWindow();
    expect(win.__forceDestroy).toBe(true);
    expect(win.destroy).toHaveBeenCalled();
    await expect(pending).resolves.toEqual({ response: 0 });
  });

  it("window close event preventDefault hide-caches and cancels", async () => {
    const { presentUpdateDialog } = await getModule();
    const pending = presentUpdateDialog({
      message: "Couldn’t check for updates",
      type: "error",
      buttons: [],
    });
    await vi.waitFor(() => {
      expect(windowInstances[0]?.loadURL).toHaveBeenCalled();
    });
    const win = windowInstances[0]!;
    const close = getWindowHandlers(win).get("close");
    expect(close).toBeDefined();
    const event = { preventDefault: vi.fn() };
    close!(event);
    expect(event.preventDefault).toHaveBeenCalled();
    await expect(pending).resolves.toEqual({ response: 0 });
  });

  it("Open Releases-only Escape returns cancelId beyond last button", async () => {
    const { presentUpdateDialog } = await getModule();
    const pending = presentUpdateDialog({
      message: "Portable builds can’t auto-update",
      buttons: ["Open Releases"],
      cancelId: 1,
    });
    await vi.waitFor(() => {
      expect(windowInstances[0]?.loadURL).toHaveBeenCalled();
    });
    const win = windowInstances[0]!;
    const html = decodeURIComponent(
      String(win.loadURL.mock.calls[0]?.[0] ?? "").replace(/^data:text\/html;charset=utf-8,/, ""),
    );
    expect(html).toContain("update-btn-0");
    expect(html).not.toContain("update-btn-1");
    const input = getWebContentsHandlers(win).get("before-input-event");
    input!(undefined, { type: "keyDown", key: "Escape" });
    await expect(pending).resolves.toEqual({ response: 1 });
  });

  it("dismiss during load does not re-show after loadURL resolves", async () => {
    const { presentUpdateDialog } = await getModule();
    let resolveLoad!: () => void;
    const loadPromise = new Promise<void>((resolve) => {
      resolveLoad = () => resolve();
    });

    // Recreate module with deferred loadURL
    vi.resetModules();
    windowInstances.length = 0;
    const { BrowserWindow } = await getElectron();
    vi.mocked(BrowserWindow).mockImplementation(function (this: WindowMock) {
      this.loadURL = vi.fn().mockReturnValue(loadPromise);
      this.show = vi.fn();
      this.hide = vi.fn();
      this.focus = vi.fn();
      this.close = vi.fn();
      this.destroy = vi.fn();
      this.setSize = vi.fn();
      this.isDestroyed = vi.fn().mockReturnValue(false);
      // Visible so settleAndHide actually calls hide()
      this.isVisible = vi.fn().mockReturnValue(true);
      this.webContents = {
        send: vi.fn(),
        on: vi.fn(),
        setWindowOpenHandler: vi.fn(),
        executeJavaScript: vi.fn().mockResolvedValue(undefined),
        isDestroyed: vi.fn().mockReturnValue(false),
      };
      this.once = vi.fn();
      this.on = vi.fn();
      windowInstances.push(this);
    });

    const mod = await getModule();
    const pending = mod.presentUpdateDialog({
      message: "GogMeet is up to date",
      buttons: [],
    });
    await vi.waitFor(() => {
      expect(windowInstances[0]?.loadURL).toHaveBeenCalled();
    });
    const win = windowInstances[0]!;
    const input = getWebContentsHandlers(win).get("before-input-event");
    expect(input).toBeDefined();
    input!(undefined, { type: "keyDown", key: "Escape" });
    await expect(pending).resolves.toEqual({ response: 0 });
    expect(win.hide).toHaveBeenCalled();
    win.show.mockClear();
    resolveLoad();
    await Promise.resolve();
    await Promise.resolve();
    // Late load completion must not re-show
    expect(win.show).not.toHaveBeenCalled();
  });

  it("superseded result waiter resolves with its own cancelId", async () => {
    const { presentUpdateDialog } = await getModule();
    const first = presentUpdateDialog({
      message: "First",
      buttons: ["A", "B"],
      cancelId: 1,
    });
    await vi.waitFor(() => {
      expect(windowInstances[0]?.loadURL).toHaveBeenCalled();
    });
    const second = presentUpdateDialog({
      message: "Second",
      buttons: ["Open Releases"],
      cancelId: 1,
    });
    // First must settle with cancel 1, not hang
    await expect(first).resolves.toEqual({ response: 1 });
    const win = windowInstances[0]!;
    const nav = getWebContentsHandlers(win).get("will-navigate");
    nav!({ preventDefault: () => undefined, url: "https://gogmeet.local/__update_action__/0" });
    await expect(second).resolves.toEqual({ response: 0 });
  });
});
