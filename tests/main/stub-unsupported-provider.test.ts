import { describe, it, expect } from "vitest";
import { createStubUnsupportedProvider } from "../../src/main/calendar/providers/stub-unsupported.js";

describe("createStubUnsupportedProvider", () => {
  it("returns denied permission and runtime error without prompting", async () => {
    const provider = createStubUnsupportedProvider();
    expect(provider.id).toBe("stub-unsupported");
    expect(await provider.getPermissionStatus()).toBe("denied");
    expect(await provider.requestPermission()).toBe("denied");
    const result = await provider.getEvents(new AbortController().signal);
    expect(result.kind).toBe("err");
    if (result.kind === "err") {
      expect(result.code).toBe("runtime");
      expect(result.error).toMatch(/not available/i);
    }
  });
});
