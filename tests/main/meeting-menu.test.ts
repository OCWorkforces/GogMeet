import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MenuItemConstructorOptions } from "electron";
import type { MeetingEvent } from "../../src/shared/models.js";

vi.mock("../../src/main/settings-window.js", () => ({
  createSettingsWindow: vi.fn(),
}));

vi.mock("../../src/main/utils/meet-url.js", () => ({
  buildMeetUrl: vi.fn((event: MeetingEvent) => event.meetUrl ?? ""),
}));

// Fixed "now" for deterministic tests: 2026-04-08 at 14:00 local time
const NOW = new Date("2026-04-08T14:00:00");

function makeEvent(overrides: Partial<MeetingEvent> = {}): MeetingEvent {
  const start = new Date(NOW.getTime() + 60 * 60 * 1000); // +1h
  const end = new Date(NOW.getTime() + 2 * 60 * 60 * 1000); // +2h
  return {
    id: "evt-1",
    title: "Standup",
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    meetUrl: "https://meet.google.com/abc-def-ghi",
    calendarName: "Work",
    isAllDay: false,
    userEmail: "user@example.com",
    ...overrides,
  };
}

function todayAt(hours: number, minutes = 0): Date {
  const d = new Date(NOW);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function tomorrowAt(hours: number, minutes = 0): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() + 1);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function findItem(
  items: MenuItemConstructorOptions[],
  label: string,
): MenuItemConstructorOptions | undefined {
  return items.find((i) => i.label === label);
}

function findItemContaining(
  items: MenuItemConstructorOptions[],
  substring: string,
): MenuItemConstructorOptions | undefined {
  return items.find(
    (i) => typeof i.label === "string" && i.label.includes(substring),
  );
}

describe("buildMeetingMenuTemplate", () => {
  let buildMeetingMenuTemplate: typeof import("../../src/main/menu/meeting-menu.js").buildMeetingMenuTemplate;
  let createSettingsWindow: ReturnType<typeof vi.fn>;
  let app: { quit: ReturnType<typeof vi.fn> };
  let shell: { openExternal: ReturnType<typeof vi.fn> };
  const onAbout = vi.fn();

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    vi.resetModules();
    const mod = await import("../../src/main/menu/meeting-menu.js");
    buildMeetingMenuTemplate = mod.buildMeetingMenuTemplate;

    const settingsWindowMod = await import("../../src/main/settings-window.js");
    createSettingsWindow = settingsWindowMod.createSettingsWindow as ReturnType<
      typeof vi.fn
    >;

    const electron = await import("electron");
    app = electron.app as unknown as typeof app;
    shell = electron.shell as unknown as typeof shell;

    onAbout.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── No upcoming meetings ────────────────────────────────────
  describe("no upcoming meetings", () => {
    it("shows disabled 'No upcoming meetings' label when events array is empty", () => {
      const items = buildMeetingMenuTemplate([], true, { onAbout });

      expect(items[0]).toEqual({
        label: "No upcoming meetings",
        enabled: false,
      });
    });

    it("includes separator + Settings + About + Quit after no-meetings label", () => {
      const items = buildMeetingMenuTemplate([], true, { onAbout });

      expect(items).toHaveLength(5);
      expect(items[1]).toEqual({ type: "separator" });
      expect(items[2]?.label).toBe("Settings...");
      expect(items[3]?.label).toBe("About GogMeet");
      expect(items[4]?.label).toBe("Quit");
    });

    it("shows no-meetings when all events are all-day", () => {
      const allDay = makeEvent({ isAllDay: true });
      const items = buildMeetingMenuTemplate([allDay], true, { onAbout });

      expect(items[0]?.label).toBe("No upcoming meetings");
    });

    it("shows no-meetings when all events have ended (past)", () => {
      const past = makeEvent({
        startDate: todayAt(10, 0).toISOString(),
        endDate: todayAt(11, 0).toISOString(), // ended 3h ago
      });
      const items = buildMeetingMenuTemplate([past], true, { onAbout });

      expect(items[0]?.label).toBe("No upcoming meetings");
    });
  });

  // ─── Single today meeting with URL ───────────────────────────
  describe("single today meeting with meetUrl", () => {
    it("renders enabled item with title and time", () => {
      const event = makeEvent({
        title: "Team Sync",
        startDate: todayAt(15, 30).toISOString(),
        endDate: todayAt(16, 30).toISOString(),
      });
      const items = buildMeetingMenuTemplate([event], true, { onAbout });

      const meetingItem = findItemContaining(items, "Team Sync");
      expect(meetingItem).toBeDefined();
      expect(meetingItem?.enabled).toBe(true);
      expect(meetingItem?.click).toBeTypeOf("function");
    });

    it("click handler opens the meeting URL via shell.openExternal", () => {
      const event = makeEvent({
        startDate: todayAt(15, 0).toISOString(),
        endDate: todayAt(16, 0).toISOString(),
      });
      const items = buildMeetingMenuTemplate([event], true, { onAbout });

      const meetingItem = findItemContaining(items, "Standup");
      meetingItem?.click?.(
        {} as Electron.MenuItem,
        undefined,
        {} as Electron.KeyboardEvent,
      );

      expect(shell.openExternal).toHaveBeenCalled();
    });
  });

  // ─── Single today meeting without URL ────────────────────────
  describe("single today meeting without meetUrl", () => {
    it("renders disabled item without click handler", () => {
      const event = makeEvent({
        meetUrl: undefined,
        startDate: todayAt(15, 0).toISOString(),
        endDate: todayAt(16, 0).toISOString(),
      });
      const items = buildMeetingMenuTemplate([event], true, { onAbout });

      const meetingItem = findItemContaining(items, "Standup");
      expect(meetingItem).toBeDefined();
      expect(meetingItem?.enabled).toBe(false);
      expect(meetingItem?.click).toBeUndefined();
    });
  });

  // ─── Multiple today meetings ─────────────────────────────────
  describe("multiple today meetings", () => {
    it("shows 'Today' header followed by meeting items", () => {
      const events = [
        makeEvent({
          id: "1",
          title: "Meeting A",
          startDate: todayAt(15, 0).toISOString(),
          endDate: todayAt(16, 0).toISOString(),
        }),
        makeEvent({
          id: "2",
          title: "Meeting B",
          startDate: todayAt(17, 0).toISOString(),
          endDate: todayAt(18, 0).toISOString(),
        }),
      ];
      const items = buildMeetingMenuTemplate(events, true, { onAbout });

      expect(items[0]).toEqual({ label: "Today", enabled: false });
      expect(findItemContaining(items, "Meeting A")).toBeDefined();
      expect(findItemContaining(items, "Meeting B")).toBeDefined();
    });
  });

  // ─── Tomorrow grouping ───────────────────────────────────────
  describe("tomorrow grouping", () => {
    it("shows 'Tomorrow' header when showTomorrowMeetings is true", () => {
      const event = makeEvent({
        startDate: tomorrowAt(9, 0).toISOString(),
        endDate: tomorrowAt(10, 0).toISOString(),
      });
      const items = buildMeetingMenuTemplate([event], true, { onAbout });

      expect(findItem(items, "Tomorrow")).toBeDefined();
      expect(findItem(items, "Tomorrow")?.enabled).toBe(false);
    });

    it("has separator between Today and Tomorrow sections", () => {
      const todayEvent = makeEvent({
        id: "1",
        title: "Today Meeting",
        startDate: todayAt(15, 0).toISOString(),
        endDate: todayAt(16, 0).toISOString(),
      });
      const tomorrowEvent = makeEvent({
        id: "2",
        title: "Tomorrow Meeting",
        startDate: tomorrowAt(9, 0).toISOString(),
        endDate: tomorrowAt(10, 0).toISOString(),
      });
      const items = buildMeetingMenuTemplate(
        [todayEvent, tomorrowEvent],
        true,
        { onAbout },
      );

      // Find the index of "Tomorrow" header
      const tomorrowIdx = items.findIndex((i) => i.label === "Tomorrow");
      expect(tomorrowIdx).toBeGreaterThan(0);
      // Separator should be right before "Tomorrow"
      expect(items[tomorrowIdx - 1]).toEqual({ type: "separator" });
    });

    it("hides tomorrow events when showTomorrowMeetings is false", () => {
      const event = makeEvent({
        title: "Tomorrow Only",
        startDate: tomorrowAt(9, 0).toISOString(),
        endDate: tomorrowAt(10, 0).toISOString(),
      });
      const items = buildMeetingMenuTemplate([event], false, { onAbout });

      // Tomorrow event passes upcoming filter but is hidden → footer only
      expect(findItem(items, "Tomorrow")).toBeUndefined();
      expect(findItemContaining(items, "Tomorrow Only")).toBeUndefined();
      // Still gets footer: separator + Settings + About + Quit
      expect(items[0]).toEqual({ type: "separator" });
      expect(findItem(items, "Settings...")).toBeDefined();
    });

    it("shows today items but hides tomorrow when showTomorrowMeetings is false", () => {
      const todayEvent = makeEvent({
        id: "1",
        title: "Today One",
        startDate: todayAt(15, 0).toISOString(),
        endDate: todayAt(16, 0).toISOString(),
      });
      const tomorrowEvent = makeEvent({
        id: "2",
        title: "Tomorrow One",
        startDate: tomorrowAt(9, 0).toISOString(),
        endDate: tomorrowAt(10, 0).toISOString(),
      });
      const items = buildMeetingMenuTemplate(
        [todayEvent, tomorrowEvent],
        false,
        { onAbout },
      );

      expect(findItemContaining(items, "Today One")).toBeDefined();
      expect(findItem(items, "Tomorrow")).toBeUndefined();
      expect(findItemContaining(items, "Tomorrow One")).toBeUndefined();
    });
  });

  // ─── In-progress meeting ─────────────────────────────────────
  describe("in-progress meeting", () => {
    it("shows 'In progress' in the time label when meeting has started", () => {
      const event = makeEvent({
        title: "Running Meeting",
        startDate: todayAt(13, 0).toISOString(), // started 1h ago
        endDate: todayAt(15, 0).toISOString(), // ends in 1h
      });
      const items = buildMeetingMenuTemplate([event], true, { onAbout });

      const meetingItem = findItemContaining(items, "Running Meeting");
      expect(meetingItem).toBeDefined();
      expect(meetingItem?.label).toContain("In progress");
    });
  });

  // ─── Future meeting (not in progress) ────────────────────────
  describe("future meeting", () => {
    it("does NOT show 'In progress' for a future meeting", () => {
      const event = makeEvent({
        title: "Future Meeting",
        startDate: todayAt(16, 0).toISOString(), // 2h from now
        endDate: todayAt(17, 0).toISOString(),
      });
      const items = buildMeetingMenuTemplate([event], true, { onAbout });

      const meetingItem = findItemContaining(items, "Future Meeting");
      expect(meetingItem).toBeDefined();
      expect(meetingItem?.label).not.toContain("In progress");
    });
  });

  // ─── Filtering ───────────────────────────────────────────────
  describe("filtering", () => {
    it("filters out all-day events", () => {
      const allDay = makeEvent({
        title: "All Day",
        isAllDay: true,
        startDate: todayAt(0, 0).toISOString(),
        endDate: todayAt(23, 59).toISOString(),
      });
      const regular = makeEvent({
        id: "2",
        title: "Regular",
        startDate: todayAt(15, 0).toISOString(),
        endDate: todayAt(16, 0).toISOString(),
      });
      const items = buildMeetingMenuTemplate([allDay, regular], true, {
        onAbout,
      });

      expect(findItemContaining(items, "All Day")).toBeUndefined();
      expect(findItemContaining(items, "Regular")).toBeDefined();
    });

    it("filters out past events (endDate before now)", () => {
      const past = makeEvent({
        title: "Past Event",
        startDate: todayAt(10, 0).toISOString(),
        endDate: todayAt(11, 0).toISOString(),
      });
      const future = makeEvent({
        id: "2",
        title: "Future Event",
        startDate: todayAt(15, 0).toISOString(),
        endDate: todayAt(16, 0).toISOString(),
      });
      const items = buildMeetingMenuTemplate([past, future], true, {
        onAbout,
      });

      expect(findItemContaining(items, "Past Event")).toBeUndefined();
      expect(findItemContaining(items, "Future Event")).toBeDefined();
    });
  });

  // ─── Footer actions (Settings, About, Quit) ──────────────────
  describe("footer actions", () => {
    it("Settings click calls createSettingsWindow()", () => {
      const items = buildMeetingMenuTemplate([], true, { onAbout });

      const settingsItem = findItem(items, "Settings...");
      expect(settingsItem).toBeDefined();
      settingsItem?.click?.(
        {} as Electron.MenuItem,
        undefined,
        {} as Electron.KeyboardEvent,
      );

      expect(createSettingsWindow).toHaveBeenCalled();
    });

    it("About click calls callbacks.onAbout()", () => {
      const items = buildMeetingMenuTemplate([], true, { onAbout });

      const aboutItem = findItem(items, "About GogMeet");
      expect(aboutItem).toBeDefined();
      aboutItem?.click?.(
        {} as Electron.MenuItem,
        undefined,
        {} as Electron.KeyboardEvent,
      );

      expect(onAbout).toHaveBeenCalled();
    });

    it("Quit click calls app.quit()", () => {
      const items = buildMeetingMenuTemplate([], true, { onAbout });

      const quitItem = findItem(items, "Quit");
      expect(quitItem).toBeDefined();
      expect(quitItem?.accelerator).toBe("Cmd+Q");
      quitItem?.click?.(
        {} as Electron.MenuItem,
        undefined,
        {} as Electron.KeyboardEvent,
      );

      expect(app.quit).toHaveBeenCalled();
    });

    it("has a separator before Settings at the end (with events)", () => {
      const event = makeEvent({
        startDate: todayAt(15, 0).toISOString(),
        endDate: todayAt(16, 0).toISOString(),
      });
      const items = buildMeetingMenuTemplate([event], true, { onAbout });

      const settingsIdx = items.findIndex((i) => i.label === "Settings...");
      expect(settingsIdx).toBeGreaterThan(0);
      expect(items[settingsIdx - 1]).toEqual({ type: "separator" });
    });
  });
});
