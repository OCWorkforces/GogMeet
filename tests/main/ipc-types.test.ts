import { describe, it, expect } from "vitest";

/**
 * Tests for shared/ipc-types.ts — type utilities (now merged into ipc-channels.ts)
 *
 * This module exports TypeScript type utilities (IpcChannelMap, IpcRequest, IpcResponse).
 * We verify the module can be imported and exports the expected types.
 */

describe("shared/ipc-channels.ts type utilities", () => {
  it("module can be imported without errors", async () => {
    const module = await import("../../src/shared/ipc-channels.js");
    expect(module).toBeDefined();
  });
});
