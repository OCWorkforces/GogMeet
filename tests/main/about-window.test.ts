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
  focus: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  isDestroyed: ReturnType<typeof vi.fn>;
  webContents: WebContentsMock;
  once: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
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
    this.focus = vi.fn();
    this.close = vi.fn();
    this.isDestroyed = vi.fn().mockReturnValue(false);
    this.webContents = {
      send: vi.fn(),
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      executeJavaScript: vi.fn().mockResolvedValue(undefined),
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

  it("creates a BrowserWindow on first showAbout call", async () => {
    const { showAbout } = await getModule();
    const { BrowserWindow } = await getElectron();
    showAbout({} as never);
    expect(BrowserWindow).toHaveBeenCalledTimes(1);
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
    const script = String(win?.webContents.executeJavaScript.mock.calls[0]?.[0] ?? "");
    expect(script).toContain("about-close");
    expect(script).toContain("https://gogmeet.local/__about_close__");
  });

  it("closes the window when will-navigate hits the close sentinel", async () => {
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
    expect(win.close).toHaveBeenCalled();
  });

  it("prevents other navigations without closing", async () => {
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
    expect(win.close).not.toHaveBeenCalled();
  });

  it("closes on Escape key", async () => {
    const { showAbout } = await getModule();
    showAbout({} as never);
    const win = windowInstances[0];
    expect(win).toBeDefined();
    if (!win) return;

    const handlers = getWebContentsHandlers(win);
    const beforeInput = handlers.get("before-input-event");
    expect(beforeInput).toBeTypeOf("function");
    beforeInput?.({}, { type: "keyDown", key: "Escape" });
    expect(win.close).toHaveBeenCalled();
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
});
