import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock electron before importing auto-launch
vi.mock("electron", () => ({
  app: {
    getLoginItemSettings: vi.fn(),
    setLoginItemSettings: vi.fn(),
  },
}));

import {
  getAutoLaunchStatus,
  setAutoLaunch,
  syncAutoLaunch,
} from "../../src/main/auto-launch.js";

describe("auto-launch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAutoLaunchStatus", () => {
    it("returns true when login item is enabled", async () => {
      const { app } = await import("electron");
      vi.mocked(app.getLoginItemSettings).mockReturnValue({
        openAtLogin: true,
      } as never);

      const result = getAutoLaunchStatus();
      expect(result).toBe(true);
      expect(app.getLoginItemSettings).toHaveBeenCalledTimes(1);
    });

    it("returns false when login item is disabled", async () => {
      const { app } = await import("electron");
      vi.mocked(app.getLoginItemSettings).mockReturnValue({
        openAtLogin: false,
      } as never);

      const result = getAutoLaunchStatus();
      expect(result).toBe(false);
    });

    it("returns false when getLoginItemSettings throws", async () => {
      const { app } = await import("electron");
      vi.mocked(app.getLoginItemSettings).mockImplementation(() => {
        throw new Error("Platform not supported");
      });

      const result = getAutoLaunchStatus();
      expect(result).toBe(false);
    });
  });

  describe("syncAutoLaunch", () => {
    it("calls setAutoLaunch when state differs", async () => {
      const { app } = await import("electron");
      // Current status is false, we want to enable (true)
      vi.mocked(app.getLoginItemSettings).mockReturnValue({
        openAtLogin: false,
      } as never);

      syncAutoLaunch(true);

      expect(app.setLoginItemSettings).toHaveBeenCalledWith({
        openAtLogin: true,
        openAsHidden: false,
      });
    });

    it("is a no-op when state already matches", async () => {
      const { app } = await import("electron");
      // Current status is true, we want to set to true (no change)
      vi.mocked(app.getLoginItemSettings).mockReturnValue({
        openAtLogin: true,
      } as never);

      syncAutoLaunch(true);

      expect(app.setLoginItemSettings).not.toHaveBeenCalled();
    });

    it("calls setAutoLaunch when disabling (true -> false)", async () => {
      const { app } = await import("electron");
      // Current status is true, we want to disable (false)
      vi.mocked(app.getLoginItemSettings).mockReturnValue({
        openAtLogin: true,
      } as never);

      syncAutoLaunch(false);

      expect(app.setLoginItemSettings).toHaveBeenCalledWith({
        openAtLogin: false,
        openAsHidden: false,
      });
    });
  });
});
