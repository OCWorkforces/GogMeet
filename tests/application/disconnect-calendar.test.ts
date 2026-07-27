import { describe, it, expect, vi } from "vitest";
import { createDisconnectCalendar } from "../../src/main/application/use-cases/disconnect-calendar.js";
import { defaultCalendarUiState } from "../../src/domain/entities/calendar-ui-state.js";

describe("createDisconnectCalendar", () => {
  it("disconnects port, resets provider, and publishes UI state", async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const resetProvider = vi.fn();
    const setCachedPermission = vi.fn();
    const setUiState = vi.fn();
    const publishCalendarStatus = vi.fn();
    const isOAuthConfigured = vi.fn().mockReturnValue(true);

    const uc = createDisconnectCalendar({
      calendar: { getEvents: vi.fn(), getPermissionStatus: vi.fn(), requestPermission: vi.fn(), disconnect, isOAuthConfigured },
      publisher: { publishCalendarStatus, publishMeetingList: vi.fn() },
      resetProvider,
      setCachedPermission,
      setUiState,
    });

    await uc.execute();

    expect(disconnect).toHaveBeenCalledOnce();
    expect(resetProvider).toHaveBeenCalledOnce();
    expect(setCachedPermission).toHaveBeenCalledWith(null);
    expect(setUiState).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "disconnected",
        permission: "not-determined",
        oauthConfigured: true,
      }),
    );
    expect(publishCalendarStatus).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "disconnected", oauthConfigured: true }),
    );
  });

  it("works when disconnect is omitted", async () => {
    const setUiState = vi.fn();
    const uc = createDisconnectCalendar({
      calendar: {
        getEvents: vi.fn(),
        getPermissionStatus: vi.fn(),
        requestPermission: vi.fn(),
        isOAuthConfigured: () => false,
      },
      publisher: { publishCalendarStatus: vi.fn(), publishMeetingList: vi.fn() },
      resetProvider: vi.fn(),
      setCachedPermission: vi.fn(),
      setUiState,
    });
    await uc.execute();
    expect(setUiState).toHaveBeenCalledWith(
      expect.objectContaining({
        ...defaultCalendarUiState(),
        oauthConfigured: false,
        phase: "disconnected",
        permission: "not-determined",
      }),
    );
  });
});
