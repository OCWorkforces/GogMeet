import { describe, it, expect, vi, beforeEach } from "vitest";

const forcePoll = vi.fn();
const getCalendarPort = vi.fn();

vi.mock("../../src/main/scheduler/facade.js", () => ({ forcePoll }));
vi.mock("../../src/main/facades/calendar.js", () => ({ getCalendarPort }));

describe("calendar-watcher", () => {
  beforeEach(() => {
    vi.resetModules();
    forcePoll.mockReset();
    getCalendarPort.mockReset();
  });

  it("starts watch and force-polls on change", async () => {
    const startWatch = vi.fn((cb: () => void) => {
      cb();
    });
    const stopWatch = vi.fn();
    getCalendarPort.mockResolvedValue({ startWatch, stopWatch });

    const watcher = await import("../../src/main/facades/calendar-watcher.js");
    watcher.startCalendarWatcher();
    await vi.waitFor(() => expect(startWatch).toHaveBeenCalled());
    expect(forcePoll).toHaveBeenCalledWith({ reason: "watch" });

    // idempotent
    watcher.startCalendarWatcher();
    expect(getCalendarPort).toHaveBeenCalledTimes(1);

    watcher.stopCalendarWatcher();
    expect(stopWatch).toHaveBeenCalled();
  });

  it("logs poll-only when startWatch omitted", async () => {
    getCalendarPort.mockResolvedValue({});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const watcher = await import("../../src/main/facades/calendar-watcher.js");
    watcher.startCalendarWatcher();
    await vi.waitFor(() => expect(log).toHaveBeenCalledWith(expect.stringContaining("poll-only")));
    watcher.stopCalendarWatcher();
    log.mockRestore();
  });

  it("handles getCalendarPort failure", async () => {
    getCalendarPort.mockRejectedValue(new Error("no provider"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const watcher = await import("../../src/main/facades/calendar-watcher.js");
    watcher.startCalendarWatcher();
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    watcher.stopCalendarWatcher();
    warn.mockRestore();
  });

  it("revive calls reviveWatch when started", async () => {
    const reviveWatch = vi.fn();
    getCalendarPort.mockResolvedValue({ startWatch: vi.fn(), reviveWatch });
    const watcher = await import("../../src/main/facades/calendar-watcher.js");
    watcher.startCalendarWatcher();
    await vi.waitFor(() => expect(getCalendarPort).toHaveBeenCalled());
    watcher.reviveCalendarWatcher();
    expect(reviveWatch).toHaveBeenCalled();
    watcher.stopCalendarWatcher();
  });

  it("revive is no-op when never started", async () => {
    getCalendarPort.mockResolvedValue({ reviveWatch: vi.fn() });
    const watcher = await import("../../src/main/facades/calendar-watcher.js");
    watcher.reviveCalendarWatcher();
    expect(getCalendarPort).not.toHaveBeenCalled();
  });

  it("stopWatch errors are swallowed", async () => {
    getCalendarPort.mockResolvedValue({
      startWatch: vi.fn(),
      stopWatch: () => {
        throw new Error("boom");
      },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const watcher = await import("../../src/main/facades/calendar-watcher.js");
    watcher.startCalendarWatcher();
    await vi.waitFor(() => expect(getCalendarPort).toHaveBeenCalled());
    watcher.stopCalendarWatcher();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("stopWatch"), expect.anything());
    warn.mockRestore();
  });
});
