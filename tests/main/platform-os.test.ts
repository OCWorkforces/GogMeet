import { describe, it, expect } from "vitest";
import { isDarwin, isWin32 } from "../../src/main/platform/os.js";

describe("platform/os", () => {
  it("reports exactly one of darwin or win32 for common desktop platforms", () => {
    const darwin = isDarwin();
    const win32 = isWin32();
    // CI may be either; both true is impossible for real process.platform values
    expect(darwin && win32).toBe(false);
    if (process.platform === "darwin") {
      expect(darwin).toBe(true);
      expect(win32).toBe(false);
    }
    if (process.platform === "win32") {
      expect(win32).toBe(true);
      expect(darwin).toBe(false);
    }
  });
});
