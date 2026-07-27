import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  requestSingleInstanceLock,
  whenReady,
  onHandlers,
  onceHandlers,
  quit,
  exit,
  isPackaged,
  initializeApp,
  shutdownApp,
  getPackageInfo,
  loadWindowContent,
  configureMainLogging,
  mainLog,
  showErrorBox,
} = vi.hoisted(() => {
  const onHandlers = new Map<string, (...args: unknown[]) => void>();
  const onceHandlers = new Map<string, (...args: unknown[]) => void>();
  return {
    requestSingleInstanceLock: vi.fn(() => true),
    whenReady: vi.fn(() => Promise.resolve()),
    onHandlers,
    onceHandlers,
    quit: vi.fn(),
    exit: vi.fn(),
    isPackaged: { value: false },
    initializeApp: vi.fn().mockResolvedValue(undefined),
    shutdownApp: vi.fn(),
    getPackageInfo: vi.fn(() => ({ author: "Test", version: "1.0.0", name: "gogmeet" })),
    loadWindowContent: vi.fn(),
    configureMainLogging: vi.fn(),
    mainLog: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    showErrorBox: vi.fn(),
  };
});

vi.mock("electron", () => {
  const BrowserWindow = vi.fn().mockImplementation(function (this: {
    on: ReturnType<typeof vi.fn>;
    hide: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }) {
    this.on = vi.fn();
    this.hide = vi.fn();
    this.destroy = vi.fn();
  });
  return {
    app: {
      commandLine: { appendSwitch: vi.fn() },
      enableSandbox: vi.fn(),
      requestSingleInstanceLock,
      whenReady,
      quit,
      exit,
      get isPackaged() {
        return isPackaged.value;
      },
      getVersion: () => "1.0.0",
      setAboutPanelOptions: vi.fn(),
      dock: { hide: vi.fn() },
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        onHandlers.set(event, handler);
      }),
      once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        onceHandlers.set(event, handler);
      }),
    },
    BrowserWindow,
    dialog: { showErrorBox },
  };
});

vi.mock("../../src/main/app/lifecycle.js", () => ({
  initializeApp,
  shutdownApp,
}));
vi.mock("../../src/main/utils/packageInfo.js", () => ({ getPackageInfo }));
vi.mock("../../src/main/utils/browser-window.js", () => ({
  SECURE_WEB_PREFERENCES: { sandbox: true },
  getPreloadPath: () => "/preload.js",
  loadWindowContent,
}));
vi.mock("../../src/main/utils/window-chrome.js", () => ({
  platformWindowChrome: () => ({}),
}));
vi.mock("../../src/main/utils/log.js", () => ({
  configureMainLogging,
  mainLog,
}));

describe("main index bootstrap", () => {
  /** Handlers installed by the module under test in this file (for cleanup). */
  let addedUncaught: NodeJS.UncaughtExceptionListener[] = [];
  let addedRejection: NodeJS.UnhandledRejectionListener[] = [];

  beforeEach(() => {
    vi.resetModules();
    onHandlers.clear();
    onceHandlers.clear();
    requestSingleInstanceLock.mockReset().mockReturnValue(true);
    whenReady.mockReset().mockResolvedValue(undefined);
    initializeApp.mockReset().mockResolvedValue(undefined);
    shutdownApp.mockReset();
    quit.mockReset();
    exit.mockReset();
    isPackaged.value = false;
    configureMainLogging.mockClear();
    mainLog.error.mockClear();
    showErrorBox.mockClear();
    addedUncaught = [];
    addedRejection = [];
  });

  afterEach(() => {
    for (const h of addedUncaught) {
      process.removeListener("uncaughtException", h);
    }
    for (const h of addedRejection) {
      process.removeListener("unhandledRejection", h);
    }
    addedUncaught = [];
    addedRejection = [];
  });

  async function importIndex(): Promise<void> {
    const beforeUncaught = new Set(process.listeners("uncaughtException"));
    const beforeRejection = new Set(process.listeners("unhandledRejection"));
    await import("../../src/main/index.js");
    for (const h of process.listeners("uncaughtException")) {
      if (!beforeUncaught.has(h)) {
        addedUncaught.push(h as NodeJS.UncaughtExceptionListener);
      }
    }
    for (const h of process.listeners("unhandledRejection")) {
      if (!beforeRejection.has(h)) {
        addedRejection.push(h as NodeJS.UnhandledRejectionListener);
      }
    }
  }

  it("quits when single-instance lock is not acquired", async () => {
    requestSingleInstanceLock.mockReturnValue(false);
    await importIndex();
    expect(quit).toHaveBeenCalled();
    expect(configureMainLogging).toHaveBeenCalled();
  });

  it("boots window and initializeApp when lock acquired", async () => {
    await importIndex();
    expect(configureMainLogging).toHaveBeenCalled();
    expect(whenReady).toHaveBeenCalled();
    await Promise.resolve();
    await Promise.resolve();
    expect(initializeApp).toHaveBeenCalled();
  });

  it("shutdownApp on before-quit", async () => {
    await importIndex();
    await Promise.resolve();
    await Promise.resolve();
    const beforeQuit = onHandlers.get("before-quit");
    expect(beforeQuit).toBeTypeOf("function");
    beforeQuit?.();
    expect(shutdownApp).toHaveBeenCalled();
  });

  it("handles uncaughtException in unpackaged without exit", async () => {
    await importIndex();
    expect(addedUncaught.length).toBeGreaterThanOrEqual(1);
    const handler = addedUncaught[addedUncaught.length - 1]!;
    handler(new Error("boom"), "uncaughtException");
    expect(mainLog.error).toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it("exits on uncaughtException when packaged", async () => {
    isPackaged.value = true;
    await importIndex();
    expect(addedUncaught.length).toBeGreaterThanOrEqual(1);
    const handler = addedUncaught[addedUncaught.length - 1]!;
    handler(new Error("fatal"), "uncaughtException");
    expect(showErrorBox).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("logs unhandledRejection without exiting", async () => {
    await importIndex();
    expect(addedRejection.length).toBeGreaterThanOrEqual(1);
    const handler = addedRejection[addedRejection.length - 1]!;
    handler("why", Promise.resolve());
    expect(mainLog.error).toHaveBeenCalled();
  });
});
