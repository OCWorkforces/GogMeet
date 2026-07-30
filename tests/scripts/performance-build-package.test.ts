import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  inventoryDir,
  validateArtifact,
} from "../../scripts/performance/measure-build-package.mjs";

const script = join(process.cwd(), "scripts/performance/measure-build-package.mjs");

describe("perf:build-package", () => {
  it("rejects missing artifacts", () => {
    expect(
      validateArtifact({
        path: "/tmp/gogmeet-definitely-missing-artifact",
        expectedArch: "arm64",
        maxAgeMs: 86_400_000,
      }).reason,
    ).toBe("missing-artifact");
  });

  it("inventories directories without throwing on missing", () => {
    const inv = inventoryDir(join(process.cwd(), "this-dir-should-not-exist-xyz"));
    expect(inv.fileCount).toBe(0);
  });

  it("perf:build-package exits 0; successful baseline-only cannot be retained", () => {
    const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
    expect(result.status).toBe(0);
    const receipts = JSON.parse(result.stdout);
    expect(Array.isArray(receipts)).toBe(true);
    for (const r of receipts) {
      expect(r.task).toBe(15);
      expect(r.status).not.toBe("retained");
      if (r.status === "rejected") {
        expect(r.reason).toBe("baseline-only");
      }
    }
  });
});
