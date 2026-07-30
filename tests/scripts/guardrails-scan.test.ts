import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const script = join(process.cwd(), "scripts/guardrails-scan.mjs");

describe("guardrails-scan", () => {
  it("self-test validates deny-list patterns", () => {
    const result = spawnSync(process.execPath, [script, "--self-test"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/self-test.*ok/i);
  });

  it("scan of current tree exits 0 (clean)", () => {
    const result = spawnSync(process.execPath, [script], {
      encoding: "utf8",
    });
    if (result.status !== 0) {
      console.error(result.stderr || result.stdout);
    }
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/clean/i);
  });
});
