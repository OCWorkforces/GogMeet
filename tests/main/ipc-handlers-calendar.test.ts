import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted for mock functions used in vi.mock factories
const {
  mockRefreshCalendarPublication,
  mockRequestCalendarPermission,
  mockGetCalendarPermissionStatus,
  mockDisconnectCalendar,
  mockGetCalendarUiState,
  mockForcePoll,
} = vi.hoisted(() => ({
  mockRefreshCalendarPublication: vi.fn(),
  mockRequestCalendarPermission: vi.fn(),
  mockGetCalendarPermissionStatus: vi.fn(),
  mockDisconnectCalendar: vi.fn(),
  mockGetCalendarUiState: vi.fn().mockReturnValue({
    permission: "not-determined",
    phase: "disconnected",
    lastError: null,
    accountEmail: null,
    events: null,
    offline: false,
    oauthConfigured: false,
  }),
  mockForcePoll: vi.fn(),
}));

vi.mock("../../src/main/facades/calendar.js", () => ({
  refreshCalendarPublication: mockRefreshCalendarPublication,
  getCalendarEventsResult: vi.fn(),
  requestCalendarPermission: mockRequestCalendarPermission,
  getCalendarPermissionStatus: mockGetCalendarPermissionStatus,
  disconnectCalendar: mockDisconnectCalendar,
  getCalendarUiState: mockGetCalendarUiState,
  reportCalendarPollError: vi.fn(),
}));

vi.mock("../../src/main/scheduler/facade.js", () => ({
  forcePoll: mockForcePoll,
}));

import { registerCalendarHandlers } from "../../src/main/ipc-handlers/calendar.js";
import { ipcMain } from "electron";
import { authorizedInvokeEvent } from "../helpers/ipc-sender.js";
import { testAppGraph } from "../helpers/app-graph.js";

const mockIpcMain = vi.mocked(ipcMain);

function getRegisteredHandler(channel: string) {
  const call = mockIpcMain.handle.mock.calls.find((c) => c[0] === channel);
  return call?.[1];
}

const unauthorizedEvent = {
  senderFrame: { url: "https://evil.com/" },
}.As<import("electron").IpcMainInvokeEvent>();

const authorizedEvent = authorizedInvokeEvent("index").As<import("electron").IpcMainInvokeEvent>();

describe("registerCalendarHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers 5 handlers", () => {
    registerCalendarHandlers(testAppGraph());
    expect(mockIpcMain.handle).toHaveBeenCalledTimes(5);
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
      mockRefreshCalendarPublication.mockResolvedValue({
        publicationGeneration: 7,
        result: { kind: "ok", source: "live", completeness: "complete", observedAt: Date.now(), events },
      });

      registerCalendarHandlers(
        testAppGraph({
          calendar: { getEvents: mockRefreshCalendarPublication },
        }),
      );
      const handler = getRegisteredHandler("calendar:get-events");
      expect(handler).toBeDefined();

      const result = await handler!(authorizedEvent);
      expect(result).toMatchObject({
        publicationGeneration: 7,
        result: { kind: "ok", source: "live", completeness: "complete", events },
      });
    });

    it("returns unauthorized for blocked sender", async () => {
      registerCalendarHandlers(testAppGraph());
      const handler = getRegisteredHandler("calendar:get-events");

      const result = await handler!(unauthorizedEvent);
      expect(result).toEqual({
        publicationGeneration: 0,
        result: { kind: "err", error: "unauthorized", code: "unknown" },
      });
    });

    it("returns error on exception", async () => {
      mockRefreshCalendarPublication.mockRejectedValue(
        new Error("Calendar error"),
      );

      registerCalendarHandlers(
        testAppGraph({
          calendar: { getEvents: mockRefreshCalendarPublication },
        }),
      );
      const handler = getRegisteredHandler("calendar:get-events");

      const result = await handler!(authorizedEvent);
      expect(result).toEqual({
        publicationGeneration: 0,
        result: {
          kind: "err",
          error: "Calendar error",
          code: "unknown",
        },
      });
    });

    it("returns stringified error for non-Error exceptions", async () => {
      mockRefreshCalendarPublication.mockRejectedValue("string error");

      registerCalendarHandlers(
        testAppGraph({
          calendar: { getEvents: mockRefreshCalendarPublication },
        }),
      );
      const handler = getRegisteredHandler("calendar:get-events");

      const result = await handler!(authorizedEvent);
      expect(result).toEqual({
        publicationGeneration: 0,
        result: { kind: "err", error: "string error", code: "unknown" },
      });
    });
  });

  describe("calendar:request-permission", () => {
    it("returns permission status for authorized sender", async () => {
      mockRequestCalendarPermission.mockResolvedValue("granted");

      registerCalendarHandlers(testAppGraph());
      const handler = getRegisteredHandler("calendar:request-permission");

      const result = await handler!(authorizedEvent);
      expect(result).toBe("granted");
    });

    it("returns denied for unauthorized sender", async () => {
      registerCalendarHandlers(testAppGraph());
      const handler = getRegisteredHandler("calendar:request-permission");

      const result = await handler!(unauthorizedEvent);
      expect(result).toBe("denied");
    });

    it("returns denied on exception", async () => {
      mockRequestCalendarPermission.mockRejectedValue(new Error("fail"));

      registerCalendarHandlers(testAppGraph());
      const handler = getRegisteredHandler("calendar:request-permission");

      const result = await handler!(authorizedEvent);
      expect(result).toBe("denied");
    });
  });

  describe("calendar:permission-status", () => {
    it("returns status for authorized sender", async () => {
      mockGetCalendarPermissionStatus.mockResolvedValue("granted");

      registerCalendarHandlers(testAppGraph());
      const handler = getRegisteredHandler("calendar:permission-status");

      const result = await handler!(authorizedEvent);
      expect(result).toBe("granted");
    });

    it("returns denied for unauthorized sender", async () => {
      registerCalendarHandlers(testAppGraph());
      const handler = getRegisteredHandler("calendar:permission-status");

      const result = await handler!(unauthorizedEvent);
      expect(result).toBe("denied");
    });

    it("returns denied on exception", async () => {
      mockGetCalendarPermissionStatus.mockRejectedValue(new Error("fail"));

      registerCalendarHandlers(testAppGraph());
      const handler = getRegisteredHandler("calendar:permission-status");

      const result = await handler!(authorizedEvent);
      expect(result).toBe("denied");
    });
  });

  describe("calendar:disconnect and ui-state", () => {
    it("disconnect ignores unauthorized", async () => {
      registerCalendarHandlers(testAppGraph());
      const handler = getRegisteredHandler("calendar:disconnect");
      await handler!(unauthorizedEvent);
      expect(mockDisconnectCalendar).not.toHaveBeenCalled();
    });

    it("disconnect swallows errors", async () => {
      mockDisconnectCalendar.mockRejectedValue(new Error("disc fail"));
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      registerCalendarHandlers(testAppGraph());
      const handler = getRegisteredHandler("calendar:disconnect");
      await handler!(authorizedEvent);
      expect(err).toHaveBeenCalled();
      err.mockRestore();
    });

    it("ui-state returns default for unauthorized", async () => {
      registerCalendarHandlers(testAppGraph());
      const handler = getRegisteredHandler("calendar:ui-state");
      const result = await handler!(unauthorizedEvent);
      expect(result).toMatchObject({ phase: "disconnected" });
    });

    it("ui-state returns default on throw", async () => {
      mockGetCalendarUiState.mockImplementation(() => {
        throw new Error("ui fail");
      });
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      registerCalendarHandlers(testAppGraph());
      const handler = getRegisteredHandler("calendar:ui-state");
      const result = await handler!(authorizedEvent);
      expect(result).toMatchObject({ phase: "disconnected" });
      err.mockRestore();
    });
  });
});
