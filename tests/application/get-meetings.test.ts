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
      getAccountEmail: async () => "user@example.com",
      isOAuthConfigured: () => true,
      getUiState: () => uiState,
      setUiState: (partial) => {
        uiState = { ...uiState, ...partial };
      },
      setCachedPermission: (s) => {
        cachedPermission = s;
      },
    });
  }

  it("publishes ready state on successful fetch with events", async () => {
    const events = [createMockEvent()];
    vi.mocked(calendar.getEvents).mockResolvedValue({ kind: "ok", events });
    const result = await create().execute();
    expect(result.kind).toBe("ok");
    expect(uiState.phase).toBe("ready");
    expect(uiState.accountEmail).toBe("user@example.com");
    expect(cachedPermission).toBe("granted");
    expect(published.at(-1)?.phase).toBe("ready");
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
