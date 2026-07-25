import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventId } from "../../src/shared/brand.js";
import type { MeetingEvent } from "../../src/shared/meeting-event.js";
import type { ScheduledEventSnapshot } from "../../src/main/scheduler/state/index.js";
import {
  asTestEventId,
  asTestIsoUtc,
  createMockEvent,
  createMockSettings,
} from "../helpers/test-utils.js";

const { getSettingsMock } = vi.hoisted(() => ({
  getSettingsMock: vi.fn(),
}));

vi.mock("electron", () => {
  function MockNotification(this: { show: ReturnType<typeof vi.fn> }) {
    this.show = vi.fn();
  }

  return {
    Notification: MockNotification,
    shell: { openExternal: vi.fn().mockResolvedValue(undefined) },
  };
});

vi.mock("../../src/main/domain/settings.js", () => ({
  getSettings: getSettingsMock,
}));

vi.mock("../../src/main/windows/alert-window.js", () => ({
  showAlert: vi.fn(),
}));

vi.mock("../../src/main/utils/meet-url.js", () => ({
  buildMeetUrl: vi
    .fn()
    .mockReturnValue("https://meet.google.com/abc-def-ghi?authuser=user@example.com"),
  openMeetingUrl: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
}));

const { scheduleEvents } = await import("../../src/main/scheduler/index.js");
const { scheduleBrowserTimer } = await import("../../src/main/scheduler/browser-timer.js");
const { buildMeetUrl, openMeetingUrl } = await import("../../src/main/utils/meet-url.js");
const stateModule = await import("../../src/main/scheduler/state/index.js");

const BASE_NOW = new Date("2026-06-18T12:00:00.000Z").getTime();
const MINUTE_MS = 60_000;

function makeEvent(
  id: string,
  startMs: number,
  endMs: number,
  overrides: Partial<MeetingEvent> = {},
): MeetingEvent {
  return createMockEvent({
    id: asTestEventId(id),
    startDate: asTestIsoUtc(new Date(startMs).toISOString()),
    endDate: asTestIsoUtc(new Date(endMs).toISOString()),
    ...overrides,
  });
}

function setOpenBeforeMinutes(minutes: number): void {
  getSettingsMock.mockReturnValue(
    createMockSettings({ openBeforeMinutes: minutes, windowAlert: false }),
  );
}

describe("scheduler browser auto-open deadline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_NOW);
    stateModule.resetState();
    setOpenBeforeMinutes(3);
    vi.mocked(buildMeetUrl).mockClear();
    vi.mocked(openMeetingUrl).mockClear();
  });

  afterEach(() => {
    stateModule.resetState();
    vi.useRealTimers();
    vi.mocked(buildMeetUrl).mockClear();
    vi.mocked(openMeetingUrl).mockClear();
  });

  it("opens a future meeting at the configured offset before start", () => {
    const startMs = BASE_NOW + 10 * MINUTE_MS;
    const event = makeEvent("deadline-happy", startMs, startMs + 30 * MINUTE_MS);

    scheduleEvents([event]);
    vi.advanceTimersByTime(7 * MINUTE_MS);

    expect(openMeetingUrl).toHaveBeenCalledTimes(1);
    expect(stateModule.state.firedEvents.has(event.id)).toBe(true);
  });

  it("opens an unchanged future meeting after scheduler epoch changes", () => {
    const startMs = BASE_NOW + 10 * MINUTE_MS;
    const event = makeEvent("deadline-epoch-change", startMs, startMs + 30 * MINUTE_MS);

    scheduleEvents([event]);
    stateModule.state.pollEpoch += 1;
    scheduleEvents([event]);
    vi.advanceTimersByTime(7 * MINUTE_MS);

    expect(openMeetingUrl).toHaveBeenCalledTimes(1);
    expect(stateModule.state.firedEvents.has(event.id)).toBe(true);
    expect(stateModule.state.timers.has(event.id)).toBe(false);
  });

  it("does not open a future meeting before the configured offset", () => {
    const startMs = BASE_NOW + 10 * MINUTE_MS;
    const event = makeEvent("deadline-early", startMs, startMs + 30 * MINUTE_MS);

    scheduleEvents([event]);
    vi.advanceTimersByTime(7 * MINUTE_MS - 1);

    expect(openMeetingUrl).not.toHaveBeenCalled();
    expect(stateModule.state.firedEvents.has(event.id)).toBe(false);
    expect(stateModule.state.timers.has(event.id)).toBe(true);
  });

  it("reschedules when openBeforeMinutes changes between polls", () => {
    const startMs = BASE_NOW + 10 * MINUTE_MS;
    const event = makeEvent("deadline-settings-change", startMs, startMs + 30 * MINUTE_MS);

    setOpenBeforeMinutes(1);
    scheduleEvents([event]);

    setOpenBeforeMinutes(3);
    scheduleEvents([event]);

    vi.advanceTimersByTime(7 * MINUTE_MS - 1);
    expect(openMeetingUrl).not.toHaveBeenCalled();
    expect(stateModule.state.firedEvents.has(event.id)).toBe(false);

    vi.advanceTimersByTime(1);
    expect(openMeetingUrl).toHaveBeenCalledTimes(1);
    expect(stateModule.state.firedEvents.has(event.id)).toBe(true);
  });

  it("does not auto-open an in-progress meeting first discovered after start", () => {
    const startMs = BASE_NOW - 30_000;
    const event = makeEvent("deadline-started", startMs, BASE_NOW + 30 * MINUTE_MS);

    scheduleEvents([event]);
    vi.advanceTimersByTime(50);

    expect(openMeetingUrl).not.toHaveBeenCalled();
    expect(stateModule.state.firedEvents.has(event.id)).toBe(false);
    expect(stateModule.state.timers.has(event.id)).toBe(false);
    expect(stateModule.state.inMeetingIntervals.has(event.id)).toBe(true);
  });

  it("does not open when a browser timer callback runs at or after meeting start", () => {
    const startMs = BASE_NOW + MINUTE_MS;
    const endMs = startMs + 30 * MINUTE_MS;
    const event = makeEvent("deadline-late-callback", startMs, endMs);
    const openAtMs = startMs - 2 * MINUTE_MS;
    const timers = new Map<EventId, ReturnType<typeof setTimeout>>();
    const firedEvents = new Map<EventId, number>();
    const scheduledEventData = new Map<EventId, ScheduledEventSnapshot>();

    scheduleBrowserTimer(
      event,
      2 * MINUTE_MS,
      openAtMs,
      startMs,
      endMs,
      timers,
      firedEvents,
      scheduledEventData,
    );
    vi.advanceTimersByTime(2 * MINUTE_MS);

    expect(buildMeetUrl).not.toHaveBeenCalled();
    expect(openMeetingUrl).not.toHaveBeenCalled();
    // Past start with grace 0: mark fired so we do not reschedule storms
    expect(firedEvents.has(event.id)).toBe(true);
    expect(timers.has(event.id)).toBe(false);
  });
});
