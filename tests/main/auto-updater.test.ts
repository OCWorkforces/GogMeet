import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockAutoUpdater, mockLog, mockShowMessageBox, mockOpenExternal } = vi.hoisted(() => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const mockAutoUpdater = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    logger: null as unknown,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      listeners.set(event, handler);
      return mockAutoUpdater;
    }),
    checkForUpdates: vi.fn().mockResolvedValue({
      isUpdateAvailable: false,
      updateInfo: { version: "1.0.0" },
      downloadPromise: null,
    }),
    quitAndInstall: vi.fn(),
    _emit(event: string, ...args: unknown[]) {
      listeners.get(event)?.(...args);
    },
    _clearListeners() {
      listeners.clear();
    },
  };
  return {
    mockAutoUpdater,
    mockLog: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
    mockShowMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
    mockOpenExternal: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("electron", () => ({
  app: {
    isPackaged: true,
    getVersion: vi.fn().mockReturnValue("1.0.0"),
    getPath: vi.fn().mockReturnValue("/Applications/GogMeet.app/Contents/MacOS/GogMeet"),
    quit: vi.fn(),
    dock: { hide: vi.fn(), show: vi.fn() },
    setAboutPanelOptions: vi.fn(),
    whenReady: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    showAboutPanel: vi.fn(),
    getAppPath: vi.fn().mockReturnValue("/tmp/test"),
    commandLine: { appendSwitch: vi.fn() },
  },
  dialog: {
    showMessageBox: mockShowMessageBox,
  },
  shell: {
    openExternal: mockOpenExternal,
  },
}));

vi.mock("electron-updater", () => ({
  autoUpdater: mockAutoUpdater,
}));

vi.mock("electron-log", () => ({
  default: mockLog,
}));

vi.mock("../../src/main/platform/os.js", () => ({
  isDarwin: vi.fn(() => false),
  isWin32: vi.fn(() => true),
}));

vi.mock("../../src/main/utils/packageInfo.js", () => ({
  getPackageInfo: vi.fn(() => ({
    name: "gogmeet",
    productName: "GogMeet",
    version: "1.0.0",
    description: "test",
    repository: "https://github.com/iWorkforces/GogMeet",
    homepage: "https://github.com/iWorkforces/GogMeet",
    author: "test",
  })),
}));

import {
  initAutoUpdater,
  isPortableInstall,
  checkForUpdatesManual,
  getUpdaterAvailability,
  getUpdaterUiState,
  getUpdaterMenuPresentation,
  getInstallModeForTests,
  macAppBundlePathFromExe,
  parseMacDeveloperIdFromCodesignDvv,
  releasesUrl,
  CANONICAL_RELEASES_URL,
  getUpdateInstallPolicy,
  _resetAutoUpdaterForTests,
  _setAutoUpdaterTestHooks,
  setUpdaterUiStateListener,
} from "../../src/main/system/auto-updater.js";
import { isDarwin, isWin32 } from "../../src/main/platform/os.js";
import { getPackageInfo } from "../../src/main/utils/packageInfo.js";

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

describe("macAppBundlePathFromExe / parseMacDeveloperIdFromCodesignDvv", () => {
  it("resolves .app bundle from Contents/MacOS/exe", () => {
    expect(
      macAppBundlePathFromExe("/Applications/GogMeet.app/Contents/MacOS/GogMeet"),
    ).toBe("/Applications/GogMeet.app");
  });

  it("returns null when path is not under .app", () => {
    expect(macAppBundlePathFromExe("/usr/local/bin/gogmeet")).toBeNull();
  });

  it("accepts Developer ID Application authority", () => {
    expect(
      parseMacDeveloperIdFromCodesignDvv(
        "Authority=Developer ID Application: Example Org (TEAMID)\nTeamIdentifier=TEAMID\n",
      ),
    ).toBe(true);
  });

  it("rejects ad-hoc signatures", () => {
    expect(parseMacDeveloperIdFromCodesignDvv("Signature=adhoc\nflags=0x2(adhoc)\n")).toBe(
      false,
    );
  });

  it("rejects bare verify-style output without Developer ID", () => {
    expect(parseMacDeveloperIdFromCodesignDvv("Authority=Apple Development: Foo\n")).toBe(
      false,
    );
  });
});

describe("releasesUrl", () => {
  it("uses package repository when iWorkforces host/path match", () => {
    expect(releasesUrl()).toBe("https://github.com/iWorkforces/GogMeet/releases");
  });

  it("falls back to canonical constant", () => {
    expect(CANONICAL_RELEASES_URL).toContain("iWorkforces/GogMeet/releases");
  });
});

describe("initAutoUpdater", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockAutoUpdater.autoDownload = false;
    mockAutoUpdater.autoInstallOnAppQuit = false;
    mockAutoUpdater._clearListeners();
    delete process.env["PORTABLE_EXECUTABLE_DIR"];
    delete process.env["PORTABLE_EXECUTABLE_FILE"];
    delete process.env["GOGMEET_PORTABLE"];
    delete process.env["GOGMEET_UNSIGNED"];
    _resetAutoUpdaterForTests();
    _setAutoUpdaterTestHooks({
      showMessageBox: mockShowMessageBox,
      openExternal: mockOpenExternal,
    });
    vi.mocked(isDarwin).mockReturnValue(false);
    vi.mocked(isWin32).mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env["PORTABLE_EXECUTABLE_DIR"];
    delete process.env["PORTABLE_EXECUTABLE_FILE"];
    delete process.env["GOGMEET_PORTABLE"];
    delete process.env["GOGMEET_UNSIGNED"];
    _resetAutoUpdaterForTests();
  });

  it("returns early when app is not packaged", async () => {
    const electron = await import("electron");
    Object.defineProperty(electron.app, "isPackaged", { value: false, writable: true });

    initAutoUpdater();
    await vi.advanceTimersByTimeAsync(5000);

    expect(mockAutoUpdater.on).not.toHaveBeenCalled();
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();

    Object.defineProperty(electron.app, "isPackaged", { value: true, writable: true });
  });

  it("skips updates for portable installs", async () => {
    process.env["PORTABLE_EXECUTABLE_DIR"] = "C:\\portable";
    initAutoUpdater();
    await vi.advanceTimersByTimeAsync(5000);
    expect(mockAutoUpdater.on).not.toHaveBeenCalled();
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining("Portable install"));
  });

  it("configures full install mode on Windows and checks after 5s", async () => {
    initAutoUpdater();
    await vi.advanceTimersByTimeAsync(5000);

    expect(mockAutoUpdater.autoDownload).toBe(true);
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true);
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledOnce();
    expect(getInstallModeForTests()).toBe("full");
  });

  it("registers event listeners once across double init", async () => {
    initAutoUpdater();
    initAutoUpdater();
    await vi.advanceTimersByTimeAsync(5000);

    expect(mockAutoUpdater.on.mock.calls.filter((c) => c[0] === "error")).toHaveLength(1);
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledOnce();
  });

  it("logs update events without dialog when no user session", async () => {
    initAutoUpdater();
    await vi.advanceTimersByTimeAsync(5000);

    mockAutoUpdater._emit("update-available", { version: "2.0.0" });
    mockAutoUpdater._emit("update-downloaded", { version: "2.0.0" });
    mockAutoUpdater._emit("error", new Error("network error"));

    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining("2.0.0"));
    expect(mockShowMessageBox).not.toHaveBeenCalled();
    expect(getUpdaterUiState()).toBe("ready-to-install");
  });

  it("skips background check when manual session is active", async () => {
    let resolveCheck: (v: unknown) => void = () => {};
    mockAutoUpdater.checkForUpdates.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCheck = resolve;
        }),
    );

    // Start manual first (holds gate)
    const manual = checkForUpdatesManual();
    initAutoUpdater();
    await vi.advanceTimersByTimeAsync(5000);

    // Manual already called check; background must not add another
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);

    resolveCheck({
      isUpdateAvailable: false,
      updateInfo: { version: "1.0.0" },
      downloadPromise: null,
    });
    await manual;
  });
});

describe("getUpdaterAvailability / menu presentation", () => {
  beforeEach(async () => {
    _resetAutoUpdaterForTests();
    delete process.env["PORTABLE_EXECUTABLE_DIR"];
    const electron = await import("electron");
    Object.defineProperty(electron.app, "isPackaged", { value: true, writable: true });
  });

  it("reports ready for packaged non-portable", () => {
    expect(getUpdaterAvailability()).toEqual({ kind: "ready" });
    expect(getUpdaterMenuPresentation()).toEqual({
      label: "Check for Updates…",
      enabled: true,
    });
  });

  it("reports portable", () => {
    process.env["PORTABLE_EXECUTABLE_DIR"] = "C:\\p";
    expect(getUpdaterAvailability()).toEqual({ kind: "portable" });
    delete process.env["PORTABLE_EXECUTABLE_DIR"];
  });

  it("reports unpackaged", async () => {
    const electron = await import("electron");
    Object.defineProperty(electron.app, "isPackaged", { value: false, writable: true });
    expect(getUpdaterAvailability()).toEqual({ kind: "unpackaged" });
    Object.defineProperty(electron.app, "isPackaged", { value: true, writable: true });
  });
});

describe("checkForUpdatesManual", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockAutoUpdater.autoDownload = true;
    mockAutoUpdater.autoInstallOnAppQuit = true;
    mockAutoUpdater._clearListeners();
    mockAutoUpdater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: false,
      updateInfo: { version: "1.0.0" },
      downloadPromise: null,
    });
    mockShowMessageBox.mockResolvedValue({ response: 0 });
    delete process.env["PORTABLE_EXECUTABLE_DIR"];
    delete process.env["PORTABLE_EXECUTABLE_FILE"];
    delete process.env["GOGMEET_PORTABLE"];
    delete process.env["GOGMEET_UNSIGNED"];
    _resetAutoUpdaterForTests();
    _setAutoUpdaterTestHooks({
      showMessageBox: mockShowMessageBox,
      openExternal: mockOpenExternal,
      isMacInstallEligible: async () => true,
    });
    vi.mocked(isDarwin).mockReturnValue(false);
    vi.mocked(isWin32).mockReturnValue(true);
    const electron = await import("electron");
    Object.defineProperty(electron.app, "isPackaged", { value: true, writable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    _resetAutoUpdaterForTests();
  });

  it("shows unpackaged dialog without calling checkForUpdates", async () => {
    const electron = await import("electron");
    Object.defineProperty(electron.app, "isPackaged", { value: false, writable: true });

    await checkForUpdatesManual();

    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(mockShowMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("packaged"),
      }),
    );
    Object.defineProperty(electron.app, "isPackaged", { value: true, writable: true });
  });

  it("shows portable dialog and can open releases", async () => {
    process.env["PORTABLE_EXECUTABLE_DIR"] = "C:\\portable";
    mockShowMessageBox.mockResolvedValue({ response: 0 });

    await checkForUpdatesManual();

    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(mockOpenExternal).toHaveBeenCalledWith(
      "https://github.com/iWorkforces/GogMeet/releases",
    );
    delete process.env["PORTABLE_EXECUTABLE_DIR"];
  });

  it("shows up-to-date dialog when no update available", async () => {
    await checkForUpdatesManual();

    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled();
    expect(mockShowMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("up to date"),
      }),
    );
    expect(getUpdaterUiState()).toBe("idle");
  });

  it("downloads update and offers Restart Now", async () => {
    let resolveDownload!: () => void;
    const downloadPromise = new Promise<string[]>((resolve) => {
      resolveDownload = () => resolve(["/tmp/update.exe"]);
    });
    mockAutoUpdater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: { version: "2.0.0" },
      downloadPromise,
    });
    mockShowMessageBox.mockResolvedValue({ response: 0 }); // Restart Now

    const manual = checkForUpdatesManual();
    // Wait until download await is active
    await vi.waitFor(() => {
      expect(getUpdaterUiState()).toBe("downloading");
    });

    mockAutoUpdater._emit("update-downloaded", { version: "2.0.0" });
    resolveDownload();
    await manual;

    expect(mockShowMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("2.0.0"),
        buttons: expect.arrayContaining(["Restart Now", "Later"]),
      }),
    );
    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it("Later leaves ready-to-install; second click re-offers without re-check", async () => {
    let resolveDownload!: () => void;
    const downloadPromise = new Promise<string[]>((resolve) => {
      resolveDownload = () => resolve(["/tmp/update.exe"]);
    });
    mockAutoUpdater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: { version: "2.0.0" },
      downloadPromise,
    });
    mockShowMessageBox.mockResolvedValue({ response: 1 }); // Later

    const manual = checkForUpdatesManual();
    await vi.waitFor(() => {
      expect(getUpdaterUiState()).toBe("downloading");
    });
    mockAutoUpdater._emit("update-downloaded", { version: "2.0.0" });
    resolveDownload();
    await manual;

    expect(mockAutoUpdater.quitAndInstall).not.toHaveBeenCalled();
    expect(getUpdaterUiState()).toBe("ready-to-install");
    expect(getUpdaterMenuPresentation().label).toBe("Restart to Update…");

    mockAutoUpdater.checkForUpdates.mockClear();
    mockShowMessageBox.mockResolvedValue({ response: 1 }); // Later again
    await checkForUpdatesManual();
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(mockShowMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        buttons: expect.arrayContaining(["Restart Now", "Later"]),
      }),
    );
  });

  it("no-ops concurrent manual while checking", async () => {
    let resolveCheck!: (v: unknown) => void;
    mockAutoUpdater.checkForUpdates.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCheck = resolve;
        }),
    );

    const first = checkForUpdatesManual();
    await vi.waitFor(() => {
      expect(getUpdaterMenuPresentation().enabled).toBe(false);
    });

    await checkForUpdatesManual(); // should no-op
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);

    resolveCheck({
      isUpdateAvailable: false,
      updateInfo: { version: "1.0.0" },
      downloadPromise: null,
    });
    await first;
  });

  it("feed-only mac (not Developer ID) opens Releases without quitAndInstall", async () => {
    vi.mocked(isDarwin).mockReturnValue(true);
    vi.mocked(isWin32).mockReturnValue(false);
    _setAutoUpdaterTestHooks({
      showMessageBox: mockShowMessageBox,
      openExternal: mockOpenExternal,
      isMacInstallEligible: async () => false,
    });
    mockAutoUpdater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: { version: "2.0.0" },
      downloadPromise: null,
    });
    mockShowMessageBox.mockResolvedValue({ response: 0 });

    await checkForUpdatesManual();

    expect(getInstallModeForTests()).toBe("feed-only");
    expect(mockAutoUpdater.autoDownload).toBe(false);
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(false);
    expect(mockShowMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("2.0.0"),
        detail: expect.stringContaining("Automatic install isn’t available"),
      }),
    );
    expect(mockOpenExternal).toHaveBeenCalled();
    expect(mockAutoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("mac Developer ID uses full download path", async () => {
    vi.mocked(isDarwin).mockReturnValue(true);
    vi.mocked(isWin32).mockReturnValue(false);
    _setAutoUpdaterTestHooks({
      showMessageBox: mockShowMessageBox,
      openExternal: mockOpenExternal,
      isMacInstallEligible: async () => true,
    });
    let resolveDownload!: () => void;
    const downloadPromise = new Promise<string[]>((resolve) => {
      resolveDownload = () => resolve(["/tmp/update.zip"]);
    });
    mockAutoUpdater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: { version: "2.0.0" },
      downloadPromise,
    });
    mockShowMessageBox.mockResolvedValue({ response: 0 });

    const manual = checkForUpdatesManual();
    await vi.waitFor(() => {
      expect(getInstallModeForTests()).toBe("full");
    });
    mockAutoUpdater._emit("update-downloaded", { version: "2.0.0" });
    resolveDownload();
    await manual;

    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalled();
  });

  it("shows single error dialog when check rejects (event + promise)", async () => {
    mockAutoUpdater.checkForUpdates.mockImplementation(async () => {
      mockAutoUpdater._emit("error", new Error("network down"));
      throw new Error("network down");
    });

    await checkForUpdatesManual();

    // May be 1 dialog from event or catch (userErrorDialogShown de-dupes)
    const errorDialogs = mockShowMessageBox.mock.calls.filter((c) =>
      String(c[0]?.message ?? "").includes("Couldn’t"),
    );
    expect(errorDialogs.length).toBe(1);
    expect(getUpdaterUiState()).toBe("idle");
  });

  it("GOGMEET_UNSIGNED overrides Windows signature verify when packaged", async () => {
    process.env["GOGMEET_UNSIGNED"] = "1";
    const nsis = mockAutoUpdater as unknown as {
      verifyUpdateCodeSignature?: unknown;
    };
    await checkForUpdatesManual(); // ensureConfigured
    expect(typeof nsis.verifyUpdateCodeSignature).toBe("function");
    delete process.env["GOGMEET_UNSIGNED"];
  });

  it("notifies ui listener when state changes", async () => {
    const listener = vi.fn();
    setUpdaterUiStateListener(listener);
    await checkForUpdatesManual(); // up to date
    expect(listener).toHaveBeenCalled();
  });

  it("downloadPromise reject shows download error dialog", async () => {
    mockAutoUpdater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: { version: "2.0.0" },
      downloadPromise: Promise.reject(new Error("disk full")),
    });

    await checkForUpdatesManual();

    expect(mockShowMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Couldn’t download"),
      }),
    );
  });

  it("null checkForUpdates result shows unavailable dialog", async () => {
    mockAutoUpdater.checkForUpdates.mockResolvedValue(null);

    await checkForUpdatesManual();

    expect(mockShowMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("not available"),
      }),
    );
  });

  it("full mode without downloadPromise falls back to Open Releases", async () => {
    mockAutoUpdater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: { version: "3.0.0" },
      downloadPromise: null,
    });
    mockShowMessageBox.mockResolvedValue({ response: 0 });

    await checkForUpdatesManual();

    expect(mockShowMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("3.0.0"),
        detail: expect.stringContaining("GitHub Releases"),
      }),
    );
    expect(mockOpenExternal).toHaveBeenCalled();
  });

  it("quitAndInstall throw shows install-failed dialog", async () => {
    let resolveDownload!: () => void;
    const downloadPromise = new Promise<string[]>((resolve) => {
      resolveDownload = () => resolve(["/tmp/update.exe"]);
    });
    mockAutoUpdater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: { version: "2.1.0" },
      downloadPromise,
    });
    mockAutoUpdater.quitAndInstall.mockImplementation(() => {
      throw new Error("install boom");
    });
    mockShowMessageBox.mockResolvedValue({ response: 0 }); // Restart Now, then Open Releases

    const manual = checkForUpdatesManual();
    await vi.waitFor(() => {
      expect(getUpdaterUiState()).toBe("downloading");
    });
    mockAutoUpdater._emit("update-downloaded", { version: "2.1.0" });
    resolveDownload();
    await manual;

    expect(mockLog.error).toHaveBeenCalledWith(
      expect.stringContaining("quitAndInstall failed"),
      expect.any(Error),
    );
    expect(mockShowMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Couldn’t install"),
      }),
    );
  });

  it("feed-only up-to-date path", async () => {
    vi.mocked(isDarwin).mockReturnValue(true);
    vi.mocked(isWin32).mockReturnValue(false);
    _setAutoUpdaterTestHooks({
      showMessageBox: mockShowMessageBox,
      openExternal: mockOpenExternal,
      isMacInstallEligible: async () => false,
    });
    mockAutoUpdater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: false,
      updateInfo: { version: "1.0.0" },
      downloadPromise: null,
    });

    await checkForUpdatesManual();

    expect(mockShowMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("up to date"),
      }),
    );
  });

  it("feed-only check error path", async () => {
    vi.mocked(isDarwin).mockReturnValue(true);
    vi.mocked(isWin32).mockReturnValue(false);
    _setAutoUpdaterTestHooks({
      showMessageBox: mockShowMessageBox,
      openExternal: mockOpenExternal,
      isMacInstallEligible: async () => false,
    });
    mockAutoUpdater.checkForUpdates.mockRejectedValue(new Error("feed down"));

    await checkForUpdatesManual();

    expect(mockShowMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Couldn’t check"),
      }),
    );
  });

  it("background update-downloaded arms ready without dialog", async () => {
    initAutoUpdater();
    await vi.advanceTimersByTimeAsync(5000);
    mockAutoUpdater._emit("update-downloaded", { version: "9.9.9" });
    expect(getUpdaterUiState()).toBe("ready-to-install");
    // No user dialog from quiet background
    expect(mockShowMessageBox).not.toHaveBeenCalled();
  });

  it("getUpdateInstallPolicy returns portable when env set", async () => {
    process.env["PORTABLE_EXECUTABLE_DIR"] = "C:\\p";
    await expect(getUpdateInstallPolicy()).resolves.toEqual({ kind: "disabled-portable" });
    delete process.env["PORTABLE_EXECUTABLE_DIR"];
  });

  it("getUpdateInstallPolicy returns unpackaged when not packaged", async () => {
    const electron = await import("electron");
    Object.defineProperty(electron.app, "isPackaged", { value: false, writable: true });
    await expect(getUpdateInstallPolicy()).resolves.toEqual({ kind: "disabled-unpackaged" });
    Object.defineProperty(electron.app, "isPackaged", { value: true, writable: true });
  });

  it("releasesUrl falls back when repository is not iWorkforces", () => {
    vi.mocked(getPackageInfo).mockReturnValueOnce({
      name: "gogmeet",
      productName: "GogMeet",
      version: "1.0.0",
      description: "test",
      repository: "https://github.com/other-org/GogMeet",
      homepage: "https://github.com/other-org/GogMeet",
      author: "test",
    });
    expect(releasesUrl()).toBe(CANONICAL_RELEASES_URL);
  });

  it("ignores feed-only update-downloaded for install arming", async () => {
    vi.mocked(isDarwin).mockReturnValue(true);
    vi.mocked(isWin32).mockReturnValue(false);
    _setAutoUpdaterTestHooks({
      showMessageBox: mockShowMessageBox,
      openExternal: mockOpenExternal,
      isMacInstallEligible: async () => false,
    });
    // Configure via a no-update manual check
    mockAutoUpdater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: false,
      updateInfo: { version: "1.0.0" },
      downloadPromise: null,
    });
    await checkForUpdatesManual();
    expect(getInstallModeForTests()).toBe("feed-only");

    mockAutoUpdater._emit("update-downloaded", { version: "2.0.0" });
    // Should not switch to ready-to-install under feed-only
    expect(getUpdaterUiState()).not.toBe("ready-to-install");
  });

  it("ui listener errors are swallowed", async () => {
    setUpdaterUiStateListener(() => {
      throw new Error("listener boom");
    });
    await checkForUpdatesManual();
    expect(mockLog.error).toHaveBeenCalledWith(
      expect.stringContaining("uiStateListener"),
      expect.any(Error),
    );
  });
});
