import { describe, it, expect, vi, beforeEach } from "vitest";

type WebContentsHandler = (...args: unknown[]) => void;

function createMockWindow() {
  const handlers = new Map<string, WebContentsHandler[]>();
  const windowHandlers = new Map<string, WebContentsHandler[]>();

  const webContents = {
    send: vi.fn(),
    on: vi.fn((event: string, handler: WebContentsHandler) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    }),
    setWindowOpenHandler: vi.fn(),
  };

  const win = {
    loadURL: vi.fn().mockResolvedValue(undefined),
    show: vi.fn(),
    focus: vi.fn(),
    close: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
    webContents,
    once: vi.fn((event: string, cb: () => void) => {
      if (event === "ready-to-show") {
        cb();
      }
    }),
    on: vi.fn((event: string, handler: WebContentsHandler) => {
      const list = windowHandlers.get(event) ?? [];
      list.push(handler);
      windowHandlers.set(event, list);
    }),
  };

  return { win, handlers, windowHandlers };
}

vi.mock("electron", () => ({
  app: {
    getVersion: vi.fn().mockReturnValue("9.9.9"),
    getName: vi.fn().mockReturnValue("GogMeet"),
    isPackaged: false,
  },
  BrowserWindow: vi.fn(),
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("node:fs", () => ({
  readFileSync: vi.fn().mockReturnValue("<svg xmlns='http://www.w3.org/2000/svg'></svg>"),
}));

vi.mock("../../src/main/utils/packageInfo.js", () => ({
  getPackageInfo: vi.fn().mockReturnValue({
    repository: "https://github.com/example/gogmeet",
    description: "Test description",
  }),
}));

vi.mock("../../src/main/utils/window-chrome.js", () => ({
  platformWindowChrome: vi.fn().mockReturnValue({
    titleBarStyle: "hiddenInset",
  }),
}));

describe("about-window", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  async function loadShowAbout() {
    const { showAbout } = await import("../../src/main/windows/about-window.js");
    const electron = await import("electron");
    return { showAbout, BrowserWindow: electron.BrowserWindow };
  }

  function mockBrowserWindow() {
    const mock = createMockWindow();
    return mock;
  }

  it("creates a BrowserWindow with secure webPreferences", async () => {
    const mock = mockBrowserWindow();
    const { showAbout, BrowserWindow } = await loadShowAbout();
    vi.mocked(BrowserWindow).mockImplementation(function (this: unknown) {
      return mock.win as never;
    });

    showAbout({} as never);

    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    const options = vi.mocked(BrowserWindow).mock.calls[0]?.[0] as {
      webPreferences?: { sandbox?: boolean; contextIsolation?: boolean; nodeIntegration?: boolean };
    };
    expect(options.webPreferences?.sandbox).toBe(true);
    expect(options.webPreferences?.contextIsolation).toBe(true);
    expect(options.webPreferences?.nodeIntegration).toBe(false);
  });

  it("loads data HTML without inline onclick handlers", async () => {
    const mock = mockBrowserWindow();
    const { showAbout, BrowserWindow } = await loadShowAbout();
    vi.mocked(BrowserWindow).mockImplementation(function () {
      return mock.win as never;
    });

    showAbout({} as never);

    expect(mock.win.loadURL).toHaveBeenCalledTimes(1);
    const loadedUrl = String(vi.mocked(mock.win.loadURL).mock.calls[0]?.[0]);
    expect(loadedUrl.startsWith("data:text/html")).toBe(true);
    const html = decodeURIComponent(loadedUrl.replace(/^data:text\/html;charset=utf-8,/, ""));
    expect(html).not.toContain("onclick=");
    expect(html).toContain('action="gogmeet://about-close"');
    expect(html).toContain('type="submit"');
  });

  it("closes the window when navigating to the about-close URL", async () => {
    const mock = mockBrowserWindow();
    const { showAbout, BrowserWindow } = await loadShowAbout();
    vi.mocked(BrowserWindow).mockImplementation(function () {
      return mock.win as never;
    });

    showAbout({} as never);

    const navigateHandlers = mock.handlers.get("will-navigate");
    expect(navigateHandlers?.length).toBe(1);

    const preventDefault = vi.fn();
    navigateHandlers?.[0]?.({ preventDefault }, "gogmeet://about-close");

    expect(preventDefault).toHaveBeenCalled();
    expect(mock.win.close).toHaveBeenCalledTimes(1);
  });

  it("prevents other navigations without closing", async () => {
    const mock = mockBrowserWindow();
    const { showAbout, BrowserWindow } = await loadShowAbout();
    vi.mocked(BrowserWindow).mockImplementation(function () {
      return mock.win as never;
    });

    showAbout({} as never);

    const preventDefault = vi.fn();
    mock.handlers.get("will-navigate")?.[0]?.(
      { preventDefault },
      "https://evil.example/phishing",
    );

    expect(preventDefault).toHaveBeenCalled();
    expect(mock.win.close).not.toHaveBeenCalled();
  });

  it("focuses an existing about window instead of creating another", async () => {
    const mock = mockBrowserWindow();
    const { showAbout, BrowserWindow } = await loadShowAbout();
    vi.mocked(BrowserWindow).mockImplementation(function () {
      return mock.win as never;
    });

    showAbout({} as never);
    showAbout({} as never);

    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    expect(mock.win.focus).toHaveBeenCalled();
  });
});
