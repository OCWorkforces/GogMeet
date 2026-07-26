import { describe, it, expect } from "vitest";
import { pickJoinTarget } from "../../src/shared/utils/pick-join-target.js";
import { asTestEventId, asTestMeetUrl, createMockEvent } from "../helpers/test-utils.js";

describe("pickJoinTarget", () => {
  it("prefers in-progress", () => {
    const now = Date.now();
    const future = createMockEvent({
      id: asTestEventId("f"),
      meetUrl: asTestMeetUrl("https://meet.google.com/future-xxx"),
      startDate: new Date(now + 3600_000).toISOString(),
      endDate: new Date(now + 7200_000).toISOString(),
    });
    const current = createMockEvent({
      id: asTestEventId("c"),
      meetUrl: asTestMeetUrl("https://meet.google.com/current-xx"),
      startDate: new Date(now - 60_000).toISOString(),
      endDate: new Date(now + 60_000).toISOString(),
    });
    expect(pickJoinTarget([future, current], now)?.id).toBe("c");
  });
});
