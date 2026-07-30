import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  simulatePollRebuilds,
  timeSyntheticBuild,
} from "../../scripts/performance/measure-tray.mjs";

const script = join(process.cwd(), "scripts/performance/measure-tray.mjs");

describe("perf:tray", () => {
  it("proves two rebuild requests per successful poll with stable order", () => {
    const rebuilds = simulatePollRebuilds([20]);
    expect(rebuilds).toHaveLength(2);
    expect(rebuilds[0]?.source).toBe("meeting-list-updated");
    expect(rebuilds[1]?.source).toBe("status-or-explicit");
    expect(rebuilds[0]?.order).toBeLessThan(rebuilds[1]!.order);
  });

  it("times synthetic builds for 20/200/1000 events", () => {
    for (const n of [20, 200, 1000]) {
      const d = timeSyntheticBuild(n, 5);
      expect(d).toHaveLength(5);
      expect(d.every((x) => Number.isFinite(x) && x >= 0)).toBe(true);
    }
  });

  it("perf:tray exits 0 with conforming terminal receipt", () => {
    const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
    expect(result.status).toBe(0);
    const receipt = JSON.parse(result.stdout);
    expect(receipt.experiment).toBe("tray-menu-rebuild");
    expect(receipt.rebuildsPerSuccessfulPoll).toBe(2);
    expect(["blocked", "rejected", "retained", "skipped"]).toContain(receipt.status);
    expect(receipt.productChange).toBe("none");
  });
});
