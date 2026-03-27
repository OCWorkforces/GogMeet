import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateSender,
  validateOnSender,
  MIN_WINDOW_HEIGHT,
  MAX_WINDOW_HEIGHT,
} from "../../src/main/ipc-handlers/shared.js";
import type { IpcMainInvokeEvent, IpcMainEvent } from "electron";

describe("validateSender (invoke)", () => {
  it("accepts file:// origin", () => {
    const event = {
      senderFrame: { url: "file:///path/to/app/index.html" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(true);
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
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(false);
  });
});

describe("validateOnSender (fire-and-forget)", () => {
  it("accepts file:// origin", () => {
    const event = {
      senderFrame: { url: "file:///app/index.html" },
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
      return { events: [] };
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
      senderFrame: { url: "file:///app/index.html" },
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
