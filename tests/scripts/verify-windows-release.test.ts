import { describe, it, expect } from "vitest";
import {
  expectedWindowsArtifacts,
  verifyWindowsReleaseInventory,
} from "../../scripts/verify-windows-release.mjs";

describe("verify-windows-release", () => {
  it("lists four expected artifacts for a version", () => {
    expect(expectedWindowsArtifacts("1.16.0")).toEqual([
      "GogMeet-1.16.0-x64.exe",
      "GogMeet-1.16.0-arm64.exe",
      "GogMeet-1.16.0-x64-portable.exe",
      "GogMeet-1.16.0-arm64-portable.exe",
    ]);
  });

  it("fails when inventory is incomplete", () => {
    const result = verifyWindowsReleaseInventory({
      files: ["GogMeet-1.16.0-x64.exe"],
      distDir: "/tmp/does-not-exist-gogmeet-win",
    });
    expect(result.ok).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
  });
});
