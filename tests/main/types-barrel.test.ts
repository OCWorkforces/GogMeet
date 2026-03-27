import { describe, it, expect } from "vitest";

/**
 * Tests for shared/types.ts — re-export barrel
 *
 * This module re-exports from focused sub-modules for backward compatibility.
 * We verify the module imports correctly and re-exports expected symbols.
 */

describe("shared/types.ts", () => {
  it("module can be imported without errors", async () => {
    const module = await import("../../src/shared/types.js");
    expect(module).toBeDefined();
  });

  it("re-exports IPC_CHANNELS", async () => {
    const { IPC_CHANNELS } = await import("../../src/shared/types.js");
    expect(IPC_CHANNELS).toBeDefined();
    expect(IPC_CHANNELS.CALENDAR_GET_EVENTS).toBe("calendar:get-events");
  });

  it("re-exports DEFAULT_SETTINGS", async () => {
    const { DEFAULT_SETTINGS } = await import("../../src/shared/types.js");
    expect(DEFAULT_SETTINGS).toBeDefined();
    expect(DEFAULT_SETTINGS.openBeforeMinutes).toBe(1);
  });
});
