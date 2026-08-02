import { describe, it, expect, vi, beforeEach } from "vitest";

type WebContentsMock = {
  send: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  setWindowOpenHandler: ReturnType<typeof vi.fn>;
  executeJavaScript: ReturnType<typeof vi.fn>;
};

type WindowMock = {
  loadURL: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
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
    getVersion: vi.fn().mockReturnValue("1.16.3"),
    getName: vi.fn().mockReturnValue("GogMeet"),
    getAppPath: vi.fn().mockReturnValue("/app"),
    isPackaged: false,
  },
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined),
  },
  BrowserWindow: vi.fn().mockImplementation(function (this: WindowMock) {
    this.loadURL = vi.fn().mockResolvedValue(undefined);
    this.show = vi.fn();
    this.hide = vi.fn();
    this.focus = vi.fn();
    this.close = vi.fn();
    this.destroy = vi.fn();
    this.isDestroyed = vi.fn().mockReturnValue(false);
    this.isVisible = vi.fn().mockReturnValue(true);
    this.webContents = {
      send: vi.fn(),
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      executeJavaScript: vi.fn().mockResolvedValue(undefined),
      isDestroyed: vi.fn().mockReturnValue(false),
    };
    this.once = vi.fn((_event: string, cb: () => void) => {
      cb();
    });
    this.on = vi.fn();
    windowInstances.push(this);
  }),
}));

vi.mock("node:fs", () => ({
  readFileSync: vi.fn().mockReturnValue("<svg></svg>"),
}));

vi.mock("../../src/main/utils/packageInfo.js", () => ({
  getPackageInfo: vi.fn().mockReturnValue({
    name: "gogmeet",
    productName: "GogMeet",
    version: "1.16.3",
    description: "Calendar meeting reminders",
    repository: "https://github.com/OCWorkforces/GogMeet",
    homepage: "https://github.com/OCWorkforces/GogMeet",
    author: "OCWorkforces Engineers",
  }),
}));

vi.mock("../../src/main/utils/window-chrome.js", () => ({
  platformWindowChrome: vi.fn().mockReturnValue({
    titleBarStyle: "hiddenInset",
  }),
  bindWindowsThemeBackground: vi.fn().mockReturnValue(() => undefined),
}));

describe("about-window", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    windowInstances.length = 0;
  });

  async function getModule() {
    return await import("../../src/main/windows/about-window.js");
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

  it("creates a BrowserWindow on first showAbout call", async () => {
    const { showAbout } = await getModule();
    const { BrowserWindow } = await getElectron();
    showAbout({} as never);
    expect(BrowserWindow).toHaveBeenCalledTimes(1);
  });

  it("uses a traffic-light-safe About size without alwaysOnTop", async () => {
    const { showAbout } = await getModule();
    const { BrowserWindow } = await getElectron();
    showAbout({} as never);
    const options = vi.mocked(BrowserWindow).mock.calls[0]?.[0] as {
      width?: number;
      height?: number;
      alwaysOnTop?: boolean;
      resizable?: boolean;
    };
    expect(options.width).toBe(320);
    expect(options.height).toBe(420);
    expect(options.resizable).toBe(false);
    expect(options.alwaysOnTop).toBe(false);
  });

  it("exports isSafeAboutRepositoryUrl for https-only repos", async () => {
    const { isSafeAboutRepositoryUrl } = await getModule();
    expect(isSafeAboutRepositoryUrl("https://github.com/OCWorkforces/GogMeet")).toBe(true);
    expect(isSafeAboutRepositoryUrl("http://github.com/OCWorkforces/GogMeet")).toBe(false);
    expect(isSafeAboutRepositoryUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeAboutRepositoryUrl("not a url")).toBe(false);
  });

  it("focuses existing window instead of creating another", async () => {
    const { showAbout } = await getModule();
    const { BrowserWindow } = await getElectron();
    showAbout({} as never);
    showAbout({} as never);
    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    expect(windowInstances[0]?.focus).toHaveBeenCalled();
  });

  it("loads a data: HTML document without inline onclick close", async () => {
    const { showAbout } = await getModule();
    showAbout({} as never);
    const win = windowInstances[0];
    expect(win).toBeDefined();
    expect(win?.loadURL).toHaveBeenCalledTimes(1);
    const url = String(win?.loadURL.mock.calls[0]?.[0] ?? "");
    expect(url.startsWith("data:text/html")).toBe(true);
    const html = decodeURIComponent(url.replace(/^data:text\/html;charset=utf-8,/, ""));
    expect(html).toContain('id="about-close"');
    expect(html).not.toContain("onclick=");
    expect(html).not.toContain("window.close()");
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("Version 1.16.3");
    expect(html).toContain("GogMeet");
    expect(html).toContain("Calendar meeting reminders");
    expect(html).toContain("Copyright");
    expect(html).toContain("OCWorkforces Engineers");
    const repo = "https://github.com/OCWorkforces/GogMeet";
    expect(html.match(new RegExp(`href="${repo}"`, "g"))?.length).toBe(1);
    expect(html).toContain('class="repo-link"');
  });

  it("wires Close via executeJavaScript after load using a sentinel URL", async () => {
    const { showAbout } = await getModule();
    showAbout({} as never);
    const win = windowInstances[0];
    expect(win).toBeDefined();

    // Allow the loadURL().then(...) microtask to run
    await Promise.resolve();
    await Promise.resolve();

    expect(win?.webContents.executeJavaScript).toHaveBeenCalled();
    const scripts = win?.webContents.executeJavaScript.mock.calls.map((c) => String(c[0] ?? "")) ?? [];
    expect(scripts.some((s) => s.includes("about-close") && s.includes("https://gogmeet.local/__about_close__"))).toBe(
      true,
    );
  });

  it("hides (caches) the window when will-navigate hits the close sentinel", async () => {
    const { showAbout } = await getModule();
    showAbout({} as never);
    const win = windowInstances[0];
    expect(win).toBeDefined();
    if (!win) return;

    const handlers = getWebContentsHandlers(win);
    const willNavigate = handlers.get("will-navigate");
    expect(willNavigate).toBeTypeOf("function");

    const event = { preventDefault: vi.fn(), url: "https://gogmeet.local/__about_close__" };
    willNavigate?.(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(win.hide).toHaveBeenCalled();
    expect(win.destroy).not.toHaveBeenCalled();
  });

  it("prevents other navigations without hiding", async () => {
    const { showAbout } = await getModule();
    showAbout({} as never);
    const win = windowInstances[0];
    expect(win).toBeDefined();
    if (!win) return;

    const handlers = getWebContentsHandlers(win);
    const willNavigate = handlers.get("will-navigate");
    const event = { preventDefault: vi.fn(), url: "https://example.com" };
    willNavigate?.(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(win.hide).not.toHaveBeenCalled();
  });

  it("hides on Escape key without destroying", async () => {
    const { showAbout } = await getModule();
    showAbout({} as never);
    const win = windowInstances[0];
    expect(win).toBeDefined();
    if (!win) return;

    const handlers = getWebContentsHandlers(win);
    const beforeInput = handlers.get("before-input-event");
    expect(beforeInput).toBeTypeOf("function");
    beforeInput?.({}, { type: "keyDown", key: "Escape" });
    expect(win.hide).toHaveBeenCalled();
    expect(win.destroy).not.toHaveBeenCalled();
  });

  it("re-shows the cached About window without creating another", async () => {
    const { showAbout } = await getModule();
    const { BrowserWindow } = await getElectron();
    showAbout({} as never);
    const win = windowInstances[0];
    expect(win).toBeDefined();
    if (!win) return;
    win.isVisible.mockReturnValue(false);
    win.show.mockClear();
    win.focus.mockClear();

    showAbout({} as never);
    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
    expect(win.loadURL).toHaveBeenCalledTimes(1);
  });

  it("prevents OS close and hides unless force-destroyed", async () => {
    const { showAbout, destroyAboutWindow } = await getModule();
    showAbout({} as never);
    const win = windowInstances[0];
    expect(win).toBeDefined();
    if (!win) return;

    const closeHandler = getWindowHandlers(win).get("close");
    expect(closeHandler).toBeTypeOf("function");
    const event = { preventDefault: vi.fn() };
    closeHandler?.(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(win.hide).toHaveBeenCalled();

    destroyAboutWindow();
    expect(win.__forceDestroy).toBe(true);
    expect(win.destroy).toHaveBeenCalled();
  });

  it("opens repository via setWindowOpenHandler and denies the popup", async () => {
    const { showAbout } = await getModule();
    const { shell } = await getElectron();
    showAbout({} as never);
    const win = windowInstances[0];
    expect(win).toBeDefined();
    if (!win) return;

    const handler = win.webContents.setWindowOpenHandler.mock.calls[0]?.[0] as
      | ((details: { url: string }) => { action: string })
      | undefined;
    expect(handler).toBeTypeOf("function");
    const result = handler?.({ url: "https://github.com/OCWorkforces/GogMeet" });
    expect(result).toEqual({ action: "deny" });
    expect(shell.openExternal).toHaveBeenCalledWith("https://github.com/OCWorkforces/GogMeet");
  });

  it("denies non-repository openExternal targets", async () => {
    const { showAbout } = await getModule();
    const { shell } = await getElectron();
    showAbout({} as never);
    const win = windowInstances[0];
    expect(win).toBeDefined();
    if (!win) return;

    const handler = win.webContents.setWindowOpenHandler.mock.calls[0]?.[0] as
      | ((details: { url: string }) => { action: string })
      | undefined;
    expect(handler?.({ url: "https://evil.example" })).toEqual({ action: "deny" });
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it("hides on will-frame-navigate sentinel", async () => {
    const { showAbout } = await getModule();
    showAbout({} as never);
    const win = windowInstances[0];
    expect(win).toBeDefined();
    if (!win) return;

    const handlers = getWebContentsHandlers(win);
    const willFrame = handlers.get("will-frame-navigate");
    expect(willFrame).toBeTypeOf("function");
    const event = { preventDefault: vi.fn(), url: "https://gogmeet.local/__about_close__" };
    willFrame?.(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(win.hide).toHaveBeenCalled();
  });

  it("supports multiple hide/show cycles without a new window", async () => {
    const { showAbout } = await getModule();
    const { BrowserWindow } = await getElectron();
    showAbout({} as never);
    const win = windowInstances[0];
    expect(win).toBeDefined();
    if (!win) return;
    const loadCalls = win.loadURL.mock.calls.length;

    for (let i = 0; i < 3; i++) {
      win.isVisible.mockReturnValue(true);
      const handlers = getWebContentsHandlers(win);
      handlers.get("before-input-event")?.({}, { type: "keyDown", key: "Escape" });
      expect(win.hide).toHaveBeenCalled();
      win.isVisible.mockReturnValue(false);
      win.show.mockClear();
      showAbout({} as never);
      expect(win.show).toHaveBeenCalled();
    }
    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    expect(win.loadURL.mock.calls.length).toBe(loadCalls);
  });

  it("creates a new window after force destroy", async () => {
    const { showAbout, destroyAboutWindow } = await getModule();
    const { BrowserWindow } = await getElectron();
    showAbout({} as never);
    destroyAboutWindow();
    showAbout({} as never);
    expect(BrowserWindow).toHaveBeenCalledTimes(2);
  });

  it("allows close to proceed when __forceDestroy is set", async () => {
    const { showAbout } = await getModule();
    showAbout({} as never);
    const win = windowInstances[0];
    expect(win).toBeDefined();
    if (!win) return;
    win.__forceDestroy = true;
    win.hide.mockClear();
    const closeHandler = getWindowHandlers(win).get("close");
    const event = { preventDefault: vi.fn() };
    closeHandler?.(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(win.hide).not.toHaveBeenCalled();
  });

  it("embeds script-src none in About CSP", async () => {
    const { showAbout } = await getModule();
    showAbout({} as never);
    const win = windowInstances[0];
    const url = String(win?.loadURL.mock.calls[0]?.[0] ?? "");
    const html = decodeURIComponent(url.replace(/^data:text\/html;charset=utf-8,/, ""));
    expect(html).toContain("script-src 'none'");
  });
});
