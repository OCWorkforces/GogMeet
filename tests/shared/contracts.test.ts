import { describe, it, expect } from "vitest";
import { IPC_CHANNELS } from "../../src/shared/ipc-channels.js";
import type { AlertPayload } from "../../src/shared/alert.js";
import type { AppState } from "../../src/shared/app-state.js";

describe("shared contracts", () => {
  it("exports IPC channel constants", () => {
    expect(IPC_CHANNELS.APP_JOIN_MEETING).toBeTypeOf("string");
    expect(IPC_CHANNELS.CALENDAR_GET_EVENTS).toBeTypeOf("string");
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
  });

  it("app state union includes loading", () => {
    const s: AppState = "loading";
    expect(s).toBe("loading");
  });
});
