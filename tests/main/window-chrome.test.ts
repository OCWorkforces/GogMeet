import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const platformState = vi.hoisted(() => ({ darwin: true }));

vi.mock("../../src/main/platform/os.js", () => ({
  isDarwin: () => platformState.darwin,
  isWin32: () => !platformState.darwin,
}));

describe("platformWindowChrome", () => {
  beforeEach(() => {
    vi.resetModules();
    platformState.darwin = true;
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

  it("omits vibrancy for settings on Windows", async () => {
    platformState.darwin = false;
    const { platformWindowChrome } = await import("../../src/main/utils/window-chrome.js");
    expect(platformWindowChrome("settings")).toEqual({
      backgroundColor: "#1c1c1e",
    });
  });

  it("includes under-window vibrancy for settings on Darwin", async () => {
    platformState.darwin = true;
    const { platformWindowChrome } = await import("../../src/main/utils/window-chrome.js");
    expect(platformWindowChrome("settings")).toMatchObject({
      vibrancy: "under-window",
      titleBarStyle: "hiddenInset",
    });
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
