import { describe, it, expect } from "vitest";
import { IPC_CHANNELS } from "../../src/shared/ipc-channels.js";
import type { AlertPayload } from "../../src/shared/alert.js";
import type { AppState } from "../../src/shared/app-state.js";

describe("shared contracts", () => {
  it("exports a complete unique IPC_CHANNELS map", () => {
    const keys = Object.keys(IPC_CHANNELS);
    const values = Object.values(IPC_CHANNELS);
    expect(keys.length).toBeGreaterThanOrEqual(15);
    expect(new Set(values).size).toBe(values.length);
    expect(IPC_CHANNELS).toMatchObject({
      CALENDAR_GET_EVENTS: "calendar:get-events",
      APP_JOIN_MEETING: "app:join-meeting",
      SETTINGS_GET: "settings:get",
      SCHEDULER_FORCE_POLL: "scheduler:force-poll",
      ALERT_DISMISSED: "alert:dismissed",
    });
  });

  it("alert payload shape is structural", () => {
    const payload: AlertPayload = {
      id: "evt" as never,
      title: "t",
      startDate: "2026-01-01T00:00:00.000Z" as never,
      endDate: "2026-01-01T01:00:00.000Z" as never,
      hasMeetUrl: true,
    };
    expect(payload.hasMeetUrl).toBe(true);
    expect(payload.title).toBe("t");
  });

  it("app state discriminant includes loading", () => {
    const s: AppState = { type: "loading" };
    expect(s.type).toBe("loading");
  });
});
