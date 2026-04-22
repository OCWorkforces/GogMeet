import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted for mock functions used in vi.mock factories
const {
  mockGetCalendarEventsResult,
  mockRequestCalendarPermission,
  mockGetCalendarPermissionStatus,
} = vi.hoisted(() => ({
  mockGetCalendarEventsResult: vi.fn(),
  mockRequestCalendarPermission: vi.fn(),
  mockGetCalendarPermissionStatus: vi.fn(),
}));

vi.mock("../../src/main/calendar.js", () => ({
  getCalendarEventsResult: mockGetCalendarEventsResult,
  requestCalendarPermission: mockRequestCalendarPermission,
  getCalendarPermissionStatus: mockGetCalendarPermissionStatus,
}));

import { registerCalendarHandlers } from "../../src/main/ipc-handlers/calendar.js";
import { ipcMain } from "electron";

const mockIpcMain = vi.mocked(ipcMain);

function getRegisteredHandler(channel: string) {
  const call = mockIpcMain.handle.mock.calls.find((c) => c[0] === channel);
  return call?.[1];
}

const authorizedEvent = {
  senderFrame: { url: "file:///path/to/lib/renderer/main.html" },
} as unknown as import("electron").IpcMainInvokeEvent;

const unauthorizedEvent = {
  senderFrame: { url: "https://evil.com/" },
} as unknown as import("electron").IpcMainInvokeEvent;

describe("registerCalendarHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers 3 handlers", () => {
    registerCalendarHandlers();
    expect(mockIpcMain.handle).toHaveBeenCalledTimes(3);
  });

  describe("calendar:get-events", () => {
    it("returns events for authorized sender", async () => {
      const events = [
        {
          id: "1",
          title: "Test Meeting",
          startDate: "2026-03-27T10:00:00Z",
          endDate: "2026-03-27T11:00:00Z",
          calendarName: "Work",
          isAllDay: false,
        },
      ];
      mockGetCalendarEventsResult.mockResolvedValue({ kind: "ok", events });

      registerCalendarHandlers();
      const handler = getRegisteredHandler("calendar:get-events");
      expect(handler).toBeDefined();

      const result = await handler!(authorizedEvent);
      expect(result).toEqual({ kind: "ok", events });
    });

    it("returns unauthorized for blocked sender", async () => {
      registerCalendarHandlers();
      const handler = getRegisteredHandler("calendar:get-events");

      const result = await handler!(unauthorizedEvent);
      expect(result).toEqual({ kind: "err", error: "unauthorized" });
    });

    it("returns error on exception", async () => {
      mockGetCalendarEventsResult.mockRejectedValue(
        new Error("Calendar error"),
      );

      registerCalendarHandlers();
      const handler = getRegisteredHandler("calendar:get-events");

      const result = await handler!(authorizedEvent);
      expect(result).toEqual({ kind: "err", error: "Calendar error" });
    });

    it("returns stringified error for non-Error exceptions", async () => {
      mockGetCalendarEventsResult.mockRejectedValue("string error");

      registerCalendarHandlers();
      const handler = getRegisteredHandler("calendar:get-events");

      const result = await handler!(authorizedEvent);
      expect(result).toEqual({ kind: "err", error: "string error" });
    });
  });

  describe("calendar:request-permission", () => {
    it("returns permission status for authorized sender", async () => {
      mockRequestCalendarPermission.mockResolvedValue("granted");

      registerCalendarHandlers();
      const handler = getRegisteredHandler("calendar:request-permission");

      const result = await handler!(authorizedEvent);
      expect(result).toBe("granted");
    });

    it("returns denied for unauthorized sender", async () => {
      registerCalendarHandlers();
      const handler = getRegisteredHandler("calendar:request-permission");

      const result = await handler!(unauthorizedEvent);
      expect(result).toBe("denied");
    });

    it("returns denied on exception", async () => {
      mockRequestCalendarPermission.mockRejectedValue(new Error("fail"));

      registerCalendarHandlers();
      const handler = getRegisteredHandler("calendar:request-permission");

      const result = await handler!(authorizedEvent);
      expect(result).toBe("denied");
    });
  });

  describe("calendar:permission-status", () => {
    it("returns status for authorized sender", async () => {
      mockGetCalendarPermissionStatus.mockResolvedValue("granted");

      registerCalendarHandlers();
      const handler = getRegisteredHandler("calendar:permission-status");

      const result = await handler!(authorizedEvent);
      expect(result).toBe("granted");
    });

    it("returns denied for unauthorized sender", async () => {
      registerCalendarHandlers();
      const handler = getRegisteredHandler("calendar:permission-status");

      const result = await handler!(unauthorizedEvent);
      expect(result).toBe("denied");
    });

    it("returns denied on exception", async () => {
      mockGetCalendarPermissionStatus.mockRejectedValue(new Error("fail"));

      registerCalendarHandlers();
      const handler = getRegisteredHandler("calendar:permission-status");

      const result = await handler!(authorizedEvent);
      expect(result).toBe("denied");
    });
  });
});
