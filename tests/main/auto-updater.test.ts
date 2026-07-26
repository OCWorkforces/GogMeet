import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockAutoUpdater, mockLog } = vi.hoisted(() => ({
  mockAutoUpdater: {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    on: vi.fn(),
    checkForUpdates: vi.fn().mockResolvedValue(null),
  },
  mockLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  app: {
    isPackaged: true,
    getVersion: vi.fn().mockReturnValue("1.0.0"),
    quit: vi.fn(),
    dock: { hide: vi.fn(), show: vi.fn() },
    setAboutPanelOptions: vi.fn(),
    whenReady: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    showAboutPanel: vi.fn(),
    getPath: vi.fn().mockReturnValue("/tmp/test"),
    commandLine: { appendSwitch: vi.fn() },
  },
}));

vi.mock("electron-updater", () => ({
  autoUpdater: mockAutoUpdater,
}));

vi.mock("electron-log", () => ({
  default: mockLog,
}));

import { initAutoUpdater, isPortableInstall } from "../../src/main/system/auto-updater.js";

describe("isPortableInstall", () => {
  const keys = [
    "PORTABLE_EXECUTABLE_DIR",
    "PORTABLE_EXECUTABLE_FILE",
    "GOGMEET_PORTABLE",
  ] as const;

  afterEach(() => {
    for (const k of keys) {
      delete process.env[k];
    }
  });

  it("is false when portable env vars are unset (NSIS-style)", () => {
    for (const k of keys) {
      delete process.env[k];
    }
    expect(isPortableInstall()).toBe(false);
  });

  it("is true when PORTABLE_EXECUTABLE_DIR is set", () => {
    process.env["PORTABLE_EXECUTABLE_DIR"] = "C:\\GogMeet";
    expect(isPortableInstall()).toBe(true);
  });

  it("is true when PORTABLE_EXECUTABLE_FILE is set", () => {
    process.env["PORTABLE_EXECUTABLE_FILE"] = "C:\\GogMeet\\GogMeet.exe";
    expect(isPortableInstall()).toBe(true);
  });

  it("is true when GOGMEET_PORTABLE=1", () => {
    process.env["GOGMEET_PORTABLE"] = "1";
    expect(isPortableInstall()).toBe(true);
  });
});

describe("initAutoUpdater", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockAutoUpdater.autoDownload = false;
    mockAutoUpdater.autoInstallOnAppQuit = false;
    delete process.env["PORTABLE_EXECUTABLE_DIR"];
    delete process.env["PORTABLE_EXECUTABLE_FILE"];
    delete process.env["GOGMEET_PORTABLE"];
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env["PORTABLE_EXECUTABLE_DIR"];
    delete process.env["PORTABLE_EXECUTABLE_FILE"];
    delete process.env["GOGMEET_PORTABLE"];
  });

  it("returns early when app is not packaged", async () => {
    const electron = await import("electron");
    Object.defineProperty(electron.app, "isPackaged", { value: false, writable: true });

    initAutoUpdater();

    expect(mockAutoUpdater.on).not.toHaveBeenCalled();
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();

    Object.defineProperty(electron.app, "isPackaged", { value: true, writable: true });
  });

  it("skips updates for portable installs", () => {
    process.env["PORTABLE_EXECUTABLE_DIR"] = "C:\\portable";
    initAutoUpdater();
    expect(mockAutoUpdater.on).not.toHaveBeenCalled();
    expect(mockLog.info).toHaveBeenCalledWith(
      expect.stringContaining("Portable install"),
    );
  });

  it("configures autoUpdater when app is packaged", () => {
    initAutoUpdater();

    expect(mockAutoUpdater.autoDownload).toBe(true);
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true);
  });

  it("registers event listeners", () => {
    initAutoUpdater();

    expect(mockAutoUpdater.on).toHaveBeenCalledWith(
      "update-available",
      expect.any(Function),
    );
    expect(mockAutoUpdater.on).toHaveBeenCalledWith(
      "update-downloaded",
      expect.any(Function),
    );
    expect(mockAutoUpdater.on).toHaveBeenCalledWith(
      "error",
      expect.any(Function),
    );
  });

  it("logs update-available event", () => {
    initAutoUpdater();

    const call = mockAutoUpdater.on.mock.calls.find(
      (c) => c[0] === "update-available",
    );
    expect(call).toBeDefined();

    call![1]({ version: "2.0.0" });
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining("2.0.0"));
  });

  it("logs update-downloaded event", () => {
    initAutoUpdater();

    const call = mockAutoUpdater.on.mock.calls.find(
      (c) => c[0] === "update-downloaded",
    );
    expect(call).toBeDefined();

    call![1]({ version: "2.0.0" });
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining("2.0.0"));
  });

  it("logs error event", () => {
    initAutoUpdater();

    const call = mockAutoUpdater.on.mock.calls.find((c) => c[0] === "error");
    expect(call).toBeDefined();

    call![1](new Error("network error"));
    expect(mockLog.error).toHaveBeenCalledWith(
      expect.stringContaining("error"),
      expect.any(Error),
    );
  });

  it("checks for updates after 5s delay", () => {
    initAutoUpdater();

    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5000);

    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledOnce();
  });
});
