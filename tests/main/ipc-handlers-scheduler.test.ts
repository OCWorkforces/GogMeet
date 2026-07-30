import { describe, it, expect } from "vitest";
import { IPC_CHANNELS } from "../../src/shared/ipc-channels.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

describe("scheduler IPC cutover", () => {
  it("does not expose a force-poll scheduler channel", () => {
    const keys = Object.keys(IPC_CHANNELS);
    const values = Object.values(IPC_CHANNELS);
    expect(keys.some((k) => k.includes("FORCE_POLL"))).toBe(false);
    expect(values).not.toContain("scheduler:force-poll");
  });

  it("does not ship a scheduler IPC handler module", () => {
    const handlerPath = resolve(
      import.meta.dirname,
      "../../src/main/ipc-handlers/scheduler.ts",
    );
    expect(existsSync(handlerPath)).toBe(false);
  });

  it("exposes calendar result push instead of events-only push", () => {
    expect(IPC_CHANNELS.CALENDAR_RESULT_UPDATED).toBe("calendar:result-updated");
    expect(Object.values(IPC_CHANNELS)).not.toContain("calendar:events-updated");
  });
});
