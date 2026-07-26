import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const platformState = vi.hoisted(() => ({ darwin: true }));

vi.mock("../../src/main/platform/os.js", () => ({
  isDarwin: () => platformState.darwin,
  isWin32: () => !platformState.darwin,
}));

describe("calendar factory", () => {
  beforeEach(async () => {
    vi.resetModules();
    platformState.darwin = true;
    delete process.env["GOGMEET_CALENDAR_FIXTURE"];
    const { resetCalendarProvider } = await import("../../src/main/calendar/factory.js");
    resetCalendarProvider();
  });

  afterEach(async () => {
    const { resetCalendarProvider } = await import("../../src/main/calendar/factory.js");
    resetCalendarProvider();
    platformState.darwin = true;
    delete process.env["GOGMEET_CALENDAR_FIXTURE"];
  });

  it("selects darwin-eventkit on Darwin", async () => {
    platformState.darwin = true;
    const { getActiveCalendarProvider } = await import("../../src/main/calendar/factory.js");
    const provider = await getActiveCalendarProvider();
    expect(provider.id).toBe("darwin-eventkit");
  });

  it("selects google-calendar on non-Darwin", async () => {
    platformState.darwin = false;
    const { getActiveCalendarProvider } = await import("../../src/main/calendar/factory.js");
    const provider = await getActiveCalendarProvider();
    expect(provider.id).toBe("google-calendar");
  });

  it("caches the provider until reset", async () => {
    platformState.darwin = false;
    const { getActiveCalendarProvider, resetCalendarProvider } = await import(
      "../../src/main/calendar/factory.js"
    );
    const a = await getActiveCalendarProvider();
    const b = await getActiveCalendarProvider();
    expect(a).toBe(b);
    resetCalendarProvider();
    const c = await getActiveCalendarProvider();
    expect(c).not.toBe(a);
    expect(c.id).toBe("google-calendar");
  });
});
