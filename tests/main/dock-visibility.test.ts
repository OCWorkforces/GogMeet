import { describe, it, expect, vi, beforeEach } from "vitest";

const dock = vi.hoisted(() => ({
  show: vi.fn(),
  hide: vi.fn(),
}));

vi.mock("electron", () => ({
  app: { dock },
}));

describe("dock-visibility", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const { resetDockVisibilityForTests } = await import(
      "../../src/main/windows/dock-visibility.js"
    );
    resetDockVisibilityForTests();
  });

  async function load() {
    return await import("../../src/main/windows/dock-visibility.js");
  }

  it("shows Dock on first acquire and hides on last release", async () => {
    const { acquireDockVisibility, releaseDockVisibility, getDockVisibilityHoldersForTests } =
      await load();
    acquireDockVisibility();
    expect(dock.show).toHaveBeenCalledTimes(1);
    expect(getDockVisibilityHoldersForTests()).toBe(1);

    acquireDockVisibility();
    expect(dock.show).toHaveBeenCalledTimes(1);
    expect(getDockVisibilityHoldersForTests()).toBe(2);

    releaseDockVisibility();
    expect(dock.hide).not.toHaveBeenCalled();
    expect(getDockVisibilityHoldersForTests()).toBe(1);

    releaseDockVisibility();
    expect(dock.hide).toHaveBeenCalledTimes(1);
    expect(getDockVisibilityHoldersForTests()).toBe(0);
  });

  it("does not go negative on extra release", async () => {
    const { releaseDockVisibility, getDockVisibilityHoldersForTests } = await load();
    releaseDockVisibility();
    releaseDockVisibility();
    expect(getDockVisibilityHoldersForTests()).toBe(0);
    expect(dock.hide).not.toHaveBeenCalled();
  });
});
