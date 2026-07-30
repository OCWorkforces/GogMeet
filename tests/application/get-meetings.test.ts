import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGetMeetings } from "../../src/main/application/use-cases/get-meetings.js";
import { defaultCalendarUiState } from "../../src/domain/entities/calendar-ui-state.js";
import type { CalendarUiState } from "../../src/domain/entities/calendar-ui-state.js";
import type { CalendarPort } from "../../src/main/application/ports/calendar-port.js";
import { createMockEvent } from "../helpers/test-utils.js";

describe("createGetMeetings", () => {
  let uiState: CalendarUiState;
  let published: CalendarUiState[];
  let cachedPermission: string | null;
  let calendar: CalendarPort;

  beforeEach(() => {
    uiState = defaultCalendarUiState();
    published = [];
    cachedPermission = null;
    calendar = {
      getEvents: vi.fn(),
      getPermissionStatus: vi.fn(),
      requestPermission: vi.fn(),
      getAccountLabel: vi.fn().mockResolvedValue("user@example.com"),
      isOAuthConfigured: vi.fn().mockReturnValue(true),
    };
  });

  function create() {
    return createGetMeetings({
      calendar,
      publisher: {
        publishCalendarStatus: (s) => {
          published.push(s);
        },
      },
      getUiState: () => uiState,
      setUiState: (partial) => {
        uiState = { ...uiState, ...partial };
      },
      setCachedPermission: (s) => {
        cachedPermission = s;
      },
    });
  }

  it("publishes ready state on successful live complete fetch with events", async () => {
    const events = [createMockEvent()];
    vi.mocked(calendar.getEvents).mockResolvedValue({
      kind: "ok",
      source: "live",
      completeness: "complete",
      observedAt: Date.now(),
      events,
    });
    const result = await create().execute();
    expect(result.kind).toBe("ok");
    expect(uiState.phase).toBe("ready");
    expect(uiState.accountEmail).toBe("user@example.com");
    expect(uiState.offline).toBe(false);
    expect(cachedPermission).toBe("granted");
    expect(published.at(-1)?.phase).toBe("ready");
  });

  it("publishes limited phase on live partial success", async () => {
    const events = [createMockEvent()];
    vi.mocked(calendar.getEvents).mockResolvedValue({
      kind: "ok",
      source: "live",
      completeness: "partial",
      observedAt: Date.now(),
      events,
    });
    await create().execute();
    expect(uiState.phase).toBe("limited");
    expect(uiState.offline).toBe(false);
    expect(uiState.lastError).toMatch(/could not be refreshed/i);
    expect(cachedPermission).toBe("granted");
  });

  it("publishes offline-cached without granting permission from kind alone", async () => {
    uiState = { ...uiState, permission: "not-determined" };
    const events = [createMockEvent()];
    const cachedAt = Date.now() - 60_000;
    vi.mocked(calendar.getEvents).mockResolvedValue({
      kind: "ok",
      source: "offline-cache",
      observedAt: cachedAt - 1_000,
      cachedAt,
      events,
    });
    await create().execute();
    expect(uiState.phase).toBe("offline-cached");
    expect(uiState.offline).toBe(true);
    expect(uiState.permission).toBe("not-determined");
    expect(cachedPermission).toBeNull();
    expect(uiState.cacheAgeMs).toBeGreaterThanOrEqual(60_000);
  });

  it("publishes error phase on failed fetch", async () => {
    vi.mocked(calendar.getEvents).mockResolvedValue({
      kind: "err",
      error: "no calendars",
      code: "no-calendars",
    });
    vi.mocked(calendar.getPermissionStatus).mockResolvedValue("denied");
    const result = await create().execute();
    expect(result.kind).toBe("err");
    expect(uiState.phase).toBe("error");
    expect(uiState.lastError).toBe("no calendars");
    expect(cachedPermission).toBe("denied");
  });
});
