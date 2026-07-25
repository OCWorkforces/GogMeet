import { describe, it, expect } from "vitest";
import { computeNextBeta } from "../../scripts/next-beta-tag.mjs";

describe("computeNextBeta", () => {
  it("starts at beta-1 when no tags exist", () => {
    expect(computeNextBeta("1.16.0", "")).toEqual({
      base: "1.16.0",
      betaNumber: 1,
      tag: "v1.16.0-beta-1",
      appVersion: "1.16.0-beta.1",
    });
  });

  it("increments past the highest beta N", () => {
    const tags = ["v1.16.0-beta-1", "v1.16.0-beta-3", "v1.16.0-beta-2"].join("\n");
    expect(computeNextBeta("1.16.0", tags).tag).toBe("v1.16.0-beta-4");
  });

  it("ignores tags for other base versions", () => {
    const tags = ["v1.15.0-beta-9", "v1.16.0-beta-2"].join("\n");
    expect(computeNextBeta("1.16.0", tags)).toMatchObject({
      tag: "v1.16.0-beta-3",
      appVersion: "1.16.0-beta.3",
    });
  });

  it("accepts refs/tags/ prefixes from ls-remote", () => {
    const tags = "refs/tags/v1.5.1-beta-1\nrefs/tags/v1.5.1-beta-1^{}";
    expect(computeNextBeta("1.5.1", tags).tag).toBe("v1.5.1-beta-2");
  });

  it("rejects non X.Y.Z base", () => {
    expect(() => computeNextBeta("1.16.0-beta.1", "")).toThrow(/X\.Y\.Z/);
  });
});
