import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mock for forcePoll — referenced by vi.mock factory below
const { mockForcePoll } = vi.hoisted(() => ({
  mockForcePoll: vi.fn(),
}));

vi.mock("../../src/main/scheduler/facade.js", () => ({
  forcePoll: mockForcePoll,
}));

import { registerSchedulerHandlers } from "../../src/main/ipc-handlers/scheduler.js";
import { ipcMain } from "electron";

const mockIpcMain = vi.mocked(ipcMain);

function getRegisteredHandler(channel: string) {
  const call = mockIpcMain.on.mock.calls.find((c) => c[0] === channel);
  return call?.[1];
}

const authorizedEvent = {
  senderFrame: { url: "file:///path/to/lib/renderer/main.html" },
} as unknown as import("electron").IpcMainEvent;

const unauthorizedEvent = {
  senderFrame: { url: "https://evil.com/" },
} as unknown as import("electron").IpcMainEvent;

const httpUnauthorizedEvent = {
  senderFrame: { url: "http://malicious.example/" },
} as unknown as import("electron").IpcMainEvent;

describe("registerSchedulerHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers exactly 1 fire-and-forget handler via ipcMain.on", () => {
    registerSchedulerHandlers();
    expect(mockIpcMain.on).toHaveBeenCalledTimes(1);
  });

  it("registers handler under the scheduler:force-poll channel", () => {
    registerSchedulerHandlers();
    expect(mockIpcMain.on).toHaveBeenCalledWith(
      "scheduler:force-poll",
      expect.any(Function),
    );
  });

  it("does not register via ipcMain.handle (fire-and-forget, not invoke)", () => {
    registerSchedulerHandlers();
    expect(mockIpcMain.handle).not.toHaveBeenCalled();
  });

  describe("scheduler:force-poll handler", () => {
    it("calls forcePoll() when sender is authorized (file:// renderer)", () => {
      registerSchedulerHandlers();
      const handler = getRegisteredHandler("scheduler:force-poll");
      expect(handler).toBeDefined();

      handler!(authorizedEvent);
      expect(mockForcePoll).toHaveBeenCalledTimes(1);
    });

    it("rejects unauthorized https:// sender — forcePoll() not invoked", () => {
      registerSchedulerHandlers();
      const handler = getRegisteredHandler("scheduler:force-poll");

      handler!(unauthorizedEvent);
      expect(mockForcePoll).not.toHaveBeenCalled();
    });

    it("rejects unauthorized http:// sender — forcePoll() not invoked", () => {
      registerSchedulerHandlers();
      const handler = getRegisteredHandler("scheduler:force-poll");

      handler!(httpUnauthorizedEvent);
      expect(mockForcePoll).not.toHaveBeenCalled();
    });

    it("rejects file:// from outside lib/renderer/", () => {
      const badFileEvent = {
        senderFrame: { url: "file:///etc/passwd" },
      } as unknown as import("electron").IpcMainEvent;

      registerSchedulerHandlers();
      const handler = getRegisteredHandler("scheduler:force-poll");

      handler!(badFileEvent);
      expect(mockForcePoll).not.toHaveBeenCalled();
    });

    it("returns undefined (fire-and-forget, not a Promise)", () => {
      mockForcePoll.mockReturnValue(Promise.resolve());

      registerSchedulerHandlers();
      const handler = getRegisteredHandler("scheduler:force-poll");

      const result = handler!(authorizedEvent);
      expect(result).toBeUndefined();
    });

    it("does not throw when forcePoll() rejects (void wrapper swallows)", () => {
      mockForcePoll.mockReturnValue(Promise.reject(new Error("poll failed")));

      registerSchedulerHandlers();
      const handler = getRegisteredHandler("scheduler:force-poll");

      expect(() => handler!(authorizedEvent)).not.toThrow();
    });
  });
});
