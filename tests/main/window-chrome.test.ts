import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const platformState = vi.hoisted(() => ({ darwin: true }));
const nativeThemeState = vi.hoisted(() => {
  const listeners = new Map<string, Set<() => void>>();
  return {
    listeners,
    on: vi.fn((event: string, cb: () => void) => {
      const set = listeners.get(event) ?? new Set();
      set.add(cb);
      listeners.set(event, set);
    }),
    removeListener: vi.fn((event: string, cb: () => void) => {
      listeners.get(event)?.delete(cb);
    }),
    emit(event: string) {
      for (const cb of listeners.get(event) ?? []) cb();
    },
    clear() {
      listeners.clear();
      nativeThemeState.on.mockClear();
      nativeThemeState.removeListener.mockClear();
    },
  };
});

vi.mock("../../src/main/platform/os.js", () => ({
  isDarwin: () => platformState.darwin,
  isWin32: () => !platformState.darwin,
}));

vi.mock("electron", () => ({
  nativeTheme: {
    on: (event: string, cb: () => void) => nativeThemeState.on(event, cb),
    removeListener: (event: string, cb: () => void) => nativeThemeState.removeListener(event, cb),
    shouldUseDarkColors: true,
  },
}));

describe("platformWindowChrome", () => {
  beforeEach(() => {
    vi.resetModules();
    platformState.darwin = true;
    nativeThemeState.clear();
  });

  afterEach(() => {
    platformState.darwin = true;
  });

  it("returns mac vibrancy options for popover on Darwin", async () => {
    platformState.darwin = true;
    const { platformWindowChrome } = await import("../../src/main/utils/window-chrome.js");
    expect(platformWindowChrome("popover")).toEqual({
      vibrancy: "popover",
      visualEffectState: "active",
      titleBarStyle: "hidden",
      transparent: true,
      hasShadow: true,
    });
  });

  it("returns opaque popover options on Windows", async () => {
    platformState.darwin = false;
    const { platformWindowChrome } = await import("../../src/main/utils/window-chrome.js");
    expect(platformWindowChrome("popover")).toEqual({
      transparent: false,
      backgroundColor: "#1c1c1e",
      hasShadow: true,
    });
  });

  it("uses solid #0d1117 for settings/about on Windows", async () => {
    platformState.darwin = false;
    const { platformWindowChrome, DIALOG_BACKGROUND_COLOR } = await import(
      "../../src/main/utils/window-chrome.js"
    );
    expect(DIALOG_BACKGROUND_COLOR).toBe("#0d1117");
    expect(platformWindowChrome("settings")).toEqual({
      backgroundColor: "#0d1117",
    });
    expect(platformWindowChrome("about")).toEqual({
      backgroundColor: "#0d1117",
    });
  });

  it("matches settings chrome for about on Darwin with solid dialog fill", async () => {
    platformState.darwin = true;
    const { platformWindowChrome } = await import("../../src/main/utils/window-chrome.js");
    expect(platformWindowChrome("settings")).toEqual({
      titleBarStyle: "hiddenInset",
      backgroundColor: "#0d1117",
    });
    expect(platformWindowChrome("about")).toEqual(platformWindowChrome("settings"));
  });

  it("returns alert chrome on Windows and Darwin", async () => {
    platformState.darwin = false;
    let chrome = await import("../../src/main/utils/window-chrome.js");
    expect(chrome.platformWindowChrome("alert")).toEqual({ backgroundColor: "#1c1c1e" });
    expect(chrome.windowsSolidBackgroundColor("alert")).toBe("#1c1c1e");
    expect(chrome.windowsSolidBackgroundColor("popover")).toBe("#1c1c1e");

    vi.resetModules();
    platformState.darwin = true;
    chrome = await import("../../src/main/utils/window-chrome.js");
    expect(chrome.platformWindowChrome("alert")).toEqual({ titleBarStyle: "hiddenInset" });
  });
});

describe("applyAlertAlwaysOnTop", () => {
  beforeEach(() => {
    vi.resetModules();
    platformState.darwin = true;
  });

  it("uses screen-saver level and all workspaces on Darwin", async () => {
    platformState.darwin = true;
    const { applyAlertAlwaysOnTop } = await import("../../src/main/utils/window-chrome.js");
    const win = {
      setAlwaysOnTop: vi.fn(),
      setVisibleOnAllWorkspaces: vi.fn(),
    };
    applyAlertAlwaysOnTop(win as never);
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true, "screen-saver");
    expect(win.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, {
      visibleOnFullScreen: true,
    });
  });

  it("uses plain always-on-top on Windows", async () => {
    platformState.darwin = false;
    const { applyAlertAlwaysOnTop } = await import("../../src/main/utils/window-chrome.js");
    const win = {
      setAlwaysOnTop: vi.fn(),
      setVisibleOnAllWorkspaces: vi.fn(),
    };
    applyAlertAlwaysOnTop(win as never);
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true);
    expect(win.setVisibleOnAllWorkspaces).not.toHaveBeenCalled();
  });
});

describe("bindWindowsThemeBackground", () => {
  beforeEach(() => {
    vi.resetModules();
    platformState.darwin = true;
    nativeThemeState.clear();
  });

  it("no-ops on Darwin", async () => {
    platformState.darwin = true;
    const { bindWindowsThemeBackground } = await import("../../src/main/utils/window-chrome.js");
    const win = { isDestroyed: () => false, setBackgroundColor: vi.fn() };
    const unbind = bindWindowsThemeBackground(win as never, "settings");
    unbind();
    expect(nativeThemeState.on).not.toHaveBeenCalled();
    expect(win.setBackgroundColor).not.toHaveBeenCalled();
  });

  it("applies solid color on theme updates for Windows", async () => {
    platformState.darwin = false;
    const { bindWindowsThemeBackground, DIALOG_BACKGROUND_COLOR } = await import(
      "../../src/main/utils/window-chrome.js"
    );
    const win = {
      isDestroyed: vi.fn().mockReturnValue(false),
      setBackgroundColor: vi.fn(),
    };
    const unbind = bindWindowsThemeBackground(win as never, "settings");
    expect(nativeThemeState.on).toHaveBeenCalledWith("updated", expect.any(Function));
    nativeThemeState.emit("updated");
    expect(win.setBackgroundColor).toHaveBeenCalledWith(DIALOG_BACKGROUND_COLOR);

    win.isDestroyed.mockReturnValue(true);
    win.setBackgroundColor.mockClear();
    nativeThemeState.emit("updated");
    expect(win.setBackgroundColor).not.toHaveBeenCalled();

    unbind();
    expect(nativeThemeState.removeListener).toHaveBeenCalled();
  });
});
