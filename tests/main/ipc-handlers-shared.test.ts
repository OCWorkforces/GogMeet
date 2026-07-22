import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateSender,
  validateOnSender,
  MIN_WINDOW_HEIGHT,
  MAX_WINDOW_HEIGHT,
} from "../../src/main/ipc-handlers/shared.js";
import type { IpcMainInvokeEvent, IpcMainEvent } from "electron";

describe("validateSender (invoke)", () => {
  it("accepts an exact packaged index renderer file", () => {
    const event = {
      senderFrame: { url: "file:///app/lib/renderer/index.html" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(true);
  });

  it.each(["settings", "alert"])("accepts exact packaged %s renderer file", (page) => {
    const event = {
      senderFrame: { url: `file:///app/lib/renderer/${page}.html` },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(true);
  });

  it("rejects path traversal escaping /lib/renderer/ via ..", () => {
    const event = {
      senderFrame: { url: "file:///lib/renderer/../../../etc/passwd.html" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("rejects path traversal that retains /lib/renderer/ substring without normalization", () => {
    // Without path.normalize(), "/path/to/lib/renderer/../../evil.html" would pass .includes() check
    const event = {
      senderFrame: { url: "file:///path/to/lib/renderer/../../evil.html" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("accepts localhost:5173", () => {
    const event = {
      senderFrame: { url: "http://localhost:5173/" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(true);
  });

  it("accepts 127.0.0.1:5173", () => {
    const event = {
      senderFrame: { url: "http://127.0.0.1:5173/" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(true);
  });

  it.each([
    "http://localhost:5173.evil.example/",
    "http://localhost:5173@evil.example/",
    "http://evil.example@localhost:5173/",
  ])("rejects an origin-prefix or userinfo spoof: %s", (url) => {
    const event = {
      senderFrame: { url },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(false);
  });

  it.each([
    "file:///app/lib/renderer/other.html",
    "file:///app/lib/renderer/index.html?unexpected=true",
    "file:///app/lib/renderer/index.html#unexpected",
    "file:///tmp/lib/renderer/index.html",
    "file://evil.example/app/lib/renderer/index.html",
  ])("rejects a non-exact packaged renderer file: %s", (url) => {
    const event = {
      senderFrame: { url },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("rejects unauthorized origin", () => {
    const event = {
      senderFrame: { url: "https://evil.com/" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("rejects empty URL", () => {
    const event = {
      senderFrame: { url: "" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("rejects undefined senderFrame", () => {
    const event = {
      senderFrame: undefined,
    };
    expect(validateSender(event)).toBe(false);
  });
});

describe("validateOnSender (fire-and-forget)", () => {
  it("accepts an exact packaged renderer file", () => {
    const event = {
      senderFrame: { url: "file:///app/lib/renderer/index.html" },
    } as IpcMainEvent;
    expect(validateOnSender(event)).toBe(true);
  });

  it("rejects unauthorized origin", () => {
    const event = {
      senderFrame: { url: "https://evil.com/" },
    } as IpcMainEvent;
    expect(validateOnSender(event)).toBe(false);
  });
});

describe("typedHandle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers handler via ipcMain.handle", async () => {
    vi.resetModules();
    const { ipcMain } = await import("electron");
    const mockIpcMain = vi.mocked(ipcMain);

    const { typedHandle } = await import(
      "../../src/main/ipc-handlers/shared.js",
    );

    mockIpcMain.handle.mockClear();
    typedHandle("calendar:get-events", async () => {
      return { kind: "ok", events: [] };
    });
    expect(mockIpcMain.handle).toHaveBeenCalledWith(
      "calendar:get-events",
      expect.any(Function),
    );
  });

  it("passes event and request to handler", async () => {
    vi.resetModules();
    const { ipcMain } = await import("electron");
    const mockIpcMain = vi.mocked(ipcMain);

    const { typedHandle } = await import(
      "../../src/main/ipc-handlers/shared.js",
    );

    let capturedRequest: unknown;
    mockIpcMain.handle.mockClear();

    typedHandle("settings:get", (_event: unknown, request: unknown) => {
      capturedRequest = request;
      return { schemaVersion: 1 } as never;
    });

    const handleCall = mockIpcMain.handle.mock.calls.find(
      (c: unknown[]) => c[0] === "settings:get",
    );
    expect(handleCall).toBeDefined();

    const handler = handleCall![1];
    const mockEvent = {
      senderFrame: { url: "file:///app/lib/renderer/index.html" },
    } as unknown as IpcMainInvokeEvent;

    await handler(mockEvent, { openBeforeMinutes: 2 });
    expect(capturedRequest).toEqual({ openBeforeMinutes: 2 });
});
});

describe("window height constants", () => {
  it("MIN_WINDOW_HEIGHT is 220", () => {
    expect(MIN_WINDOW_HEIGHT).toBe(220);
  });

  it("MAX_WINDOW_HEIGHT is 480", () => {
    expect(MAX_WINDOW_HEIGHT).toBe(480);
  });

  it("MIN is less than MAX", () => {
    expect(MIN_WINDOW_HEIGHT).toBeLessThan(MAX_WINDOW_HEIGHT);
  });
});
