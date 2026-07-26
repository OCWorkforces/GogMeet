import { describe, it, expect } from "vitest";
import { buildLatestYml } from "../../scripts/merge-windows-latest-yml.mjs";

describe("merge-windows-latest-yml", () => {
  it("buildLatestYml lists both arches and primary path", () => {
    const yml = buildLatestYml("1.16.0", [
      {
        path: "GogMeet-1.16.0-x64.exe",
        arch: "x64",
        sha512: "abc",
        size: 100,
      },
      {
        path: "GogMeet-1.16.0-arm64.exe",
        arch: "arm64",
        sha512: "def",
        size: 200,
      },
    ]);
    expect(yml).toContain("version: 1.16.0");
    expect(yml).toContain("GogMeet-1.16.0-x64.exe");
    expect(yml).toContain("GogMeet-1.16.0-arm64.exe");
    expect(yml).toContain("path: GogMeet-1.16.0-x64.exe");
    expect(yml).toContain("sha512: abc");
  });
});
