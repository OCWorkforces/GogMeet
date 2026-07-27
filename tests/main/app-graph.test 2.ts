import { describe, it, expect, vi } from "vitest";
import { createTestAppGraph } from "../../src/main/composition/create-test-app-graph.js";

describe("createTestAppGraph", () => {
  it("applies nested overrides", async () => {
    const getEvents = vi.fn().mockResolvedValue({ kind: "ok", events: [] });
    const graph = createTestAppGraph({
      calendar: { getEvents },
    });
    await graph.calendar.getEvents();
    expect(getEvents).toHaveBeenCalledOnce();
  });

  it("exposes opener and join surfaces", () => {
    const graph = createTestAppGraph();
    expect(typeof graph.opener.open).toBe("function");
    expect(typeof graph.join.byId).toBe("function");
    expect(typeof graph.scheduler.forcePoll).toBe("function");
  });
});
