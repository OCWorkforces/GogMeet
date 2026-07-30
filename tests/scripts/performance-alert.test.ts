import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  syntheticAlertPayload,
  timeVariant,
} from "../../scripts/performance/measure-alert.mjs";

const script = join(process.cwd(), "scripts/performance/measure-alert.mjs");

describe("perf:alert", () => {
  it("synthetic payloads contain no user content fields", () => {
    const p = syntheticAlertPayload(3);
    expect(p).not.toHaveProperty("title");
    expect(p).not.toHaveProperty("description");
    expect(p).not.toHaveProperty("url");
    expect(JSON.stringify(p)).not.toMatch(/meet\.google|@|password|token/i);
  });

  it("times both lifecycle variants", () => {
    const a = timeVariant("destroy-recreate", 5);
    const b = timeVariant("hidden-reuse", 5);
    expect(a).toHaveLength(5);
    expect(b).toHaveLength(5);
  });

  it("perf:alert exits 0 with terminal receipt and no product change", () => {
    const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
    expect(result.status).toBe(0);
    const receipt = JSON.parse(result.stdout);
    expect(receipt.experiment).toBe("alert-window-lifecycle");
    expect(receipt.productChange).toBe("none");
    expect(receipt.securityChecks.noUserContentInTrace).toBe(true);
    expect(["blocked", "rejected", "retained", "skipped"]).toContain(receipt.status);
  });
});
