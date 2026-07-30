import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MenuItemConstructorOptions } from "electron";
import type { MeetingEvent } from "../../src/domain/entities/meeting-event.js";
import { createMockEvent, asTestIsoUtc } from "../helpers/test-utils.js";

vi.mock("../../src/main/utils/system-settings.js", () => ({
  openSystemSettings: vi.fn(),
}));

const platformState = vi.hoisted(() => ({ darwin: true }));
vi.mock("../../src/main/platform/os.js", () => ({
  isDarwin: () => platformState.darwin,
  isWin32: () => !platformState.darwin,
}));

// Fixed "now" for deterministic tests: 2026-04-08 at 14:00 local time
const NOW = new Date("2026-04-08T14:00:00");

function makeEvent(overrides: Partial<MeetingEvent> = {}): MeetingEvent {
  const start = new Date(NOW.getTime() + 60 * 60 * 1000); // +1h
  const end = new Date(NOW.getTime() + 2 * 60 * 60 * 1000); // +2h
  return createMockEvent({
    id: "evt-1",
    title: "Standup",
    startDate: asTestIsoUtc(start.toISOString()),
    endDate: asTestIsoUtc(end.toISOString()),
    ...overrides,
  });
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
  return items.find((i) => typeof i.label === "string" && i.label.includes(substring));
}

const onJoinMeeting = vi.fn();
const onForcePoll = vi.fn();

const baseCallbacks = {
  onAbout: () => {},
  onOpenSettings: () => {},
  onJoinMeeting,
  onForcePoll,
};

describe("buildMeetingMenuTemplate", () => {
  let buildMeetingMenuTemplate: typeof import("../../src/main/menu/meeting-menu.js").buildMeetingMenuTemplate;
  let app: { quit: ReturnType<typeof vi.fn> };
  let shell: { openExternal: ReturnType<typeof vi.fn> };
  const onAbout = vi.fn();
  const onOpenSettings = vi.fn();

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    platformState.darwin = true;

    vi.resetModules();
    const mod = await import("../../src/main/menu/meeting-menu.js");
    buildMeetingMenuTemplate = mod.buildMeetingMenuTemplate;

    const electron = await import("electron");
    app = electron.app.As<typeof app>();
    shell = electron.shell.As<typeof shell>();

    onAbout.mockClear();
    onOpenSettings.mockClear();
    onJoinMeeting.mockClear();
    onForcePoll.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── No upcoming meetings ────────────────────────────────────
  describe("no upcoming meetings", () => {
    it("shows disabled 'No upcoming meetings' label when events array is empty", () => {
      const items = buildMeetingMenuTemplate([], true, {
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
      });

      expect(items[0]).toEqual({
        label: "No upcoming meetings",
        enabled: false,
      });
    });

    it("includes Refresh, Join Next, Settings, About, Quit after no-meetings label", () => {
      const items = buildMeetingMenuTemplate([], true, {
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
      });

      expect(items[0]?.label).toBe("No upcoming meetings");
      expect(findItem(items, "Join Next Meeting")).toBeDefined();
      expect(findItem(items, "Refresh")).toBeDefined();
      expect(findItem(items, "Settings...")).toBeDefined();
      expect(findItem(items, "About GogMeet")).toBeDefined();
      expect(findItem(items, "Quit")).toBeDefined();
    });

    it("shows no-meetings when all events are all-day", () => {
      const allDay = makeEvent({ isAllDay: true });
      const items = buildMeetingMenuTemplate([allDay], true, {
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
      });

      expect(items[0]?.label).toBe("No upcoming meetings");
    });

    it("shows no-meetings when all events have ended (past)", () => {
      const past = makeEvent({
        startDate: todayAt(10, 0).toISOString(),
        endDate: todayAt(11, 0).toISOString(), // ended 3h ago
      });
      const items = buildMeetingMenuTemplate([past], true, {
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
      });

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
      const items = buildMeetingMenuTemplate([event], true, {
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
      });

      const meetingItem = findItemContaining(items, "Team Sync");
      expect(meetingItem).toBeDefined();
      expect(Array.isArray(meetingItem?.submenu)).toBe(true);
    });

    it("submenu Join joins via onJoinMeeting", () => {
      const event = makeEvent({
        startDate: todayAt(15, 0).toISOString(),
        endDate: todayAt(16, 0).toISOString(),
      });
      const items = buildMeetingMenuTemplate([event], true, {
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
      });

      const meetingItem = findItemContaining(items, "Standup");
      const submenu = meetingItem?.submenu as MenuItemConstructorOptions[] | undefined;
      const join = submenu?.find((i) => i.label === "Join");
      join?.click?.({} as Electron.MenuItem, undefined, {} as Electron.KeyboardEvent);

      expect(onJoinMeeting).toHaveBeenCalledWith(event.id);
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
      const items = buildMeetingMenuTemplate([event], true, {
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
      });

      const meetingItem = findItemContaining(items, "Standup");
      expect(meetingItem).toBeDefined();
      expect(meetingItem?.enabled).toBe(false);
      expect(meetingItem?.click).toBeUndefined();
    });
  });

  // ─── Zoom meeting with URL ──────────────────────────────────
  describe("Zoom meeting with meetUrl", () => {
    it("renders enabled item for Zoom event", () => {
      const event = makeEvent({
        title: "Zoom Sync",
        meetUrl: "https://zoom.us/j/1234567890",
        startDate: todayAt(15, 0).toISOString(),
        endDate: todayAt(16, 0).toISOString(),
      });
      const items = buildMeetingMenuTemplate([event], true, {
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
      });

      const meetingItem = findItemContaining(items, "Zoom Sync");
      expect(meetingItem).toBeDefined();
      expect(Array.isArray(meetingItem?.submenu)).toBe(true);
    });

    it("submenu Join joins Zoom event via onJoinMeeting", () => {
      const event = makeEvent({
        meetUrl: "https://us02web.zoom.us/j/789?pwd=secret",
        startDate: todayAt(15, 0).toISOString(),
        endDate: todayAt(16, 0).toISOString(),
      });
      const items = buildMeetingMenuTemplate([event], true, {
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
      });

      const meetingItem = findItemContaining(items, "Standup");
      const submenu = meetingItem?.submenu as MenuItemConstructorOptions[] | undefined;
      const join = submenu?.find((i) => i.label === "Join");
      join?.click?.({} as Electron.MenuItem, undefined, {} as Electron.KeyboardEvent);

      expect(onJoinMeeting).toHaveBeenCalledWith(event.id);
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
      const items = buildMeetingMenuTemplate(events, true, {
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
      });

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
      const items = buildMeetingMenuTemplate([event], true, {
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
      });

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
      const items = buildMeetingMenuTemplate([todayEvent, tomorrowEvent], true, {
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
      });

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
      const items = buildMeetingMenuTemplate([event], false, {
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
      });

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
      const items = buildMeetingMenuTemplate([todayEvent, tomorrowEvent], false, {
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
      });

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
      const items = buildMeetingMenuTemplate([event], true, {
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
      });

      const meetingItem = findItemContaining(items, "Running Meeting");
      expect(meetingItem).toBeDefined();
      expect(meetingItem?.label).toContain("In progress");
    });

    it("does NOT show ended meetings as In progress (2PM–3:30 still gone at 4:20)", () => {
      // Meeting 14:00–15:30; "now" is driven by todayAt helpers relative to system clock.
      // Use end in the past relative to fixed now via past end times already in suite style.
      const event = makeEvent({
        title: "Afternoon Sync",
        startDate: todayAt(10, 0).toISOString(),
        endDate: todayAt(11, 0).toISOString(), // ended earlier today
      });
      const items = buildMeetingMenuTemplate([event], true, {
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
      });
      expect(findItemContaining(items, "Afternoon Sync")).toBeUndefined();
      expect(findItemContaining(items, "In progress")).toBeUndefined();
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
      const items = buildMeetingMenuTemplate([event], true, {
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
      });

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
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
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
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
      });

      expect(findItemContaining(items, "Past Event")).toBeUndefined();
      expect(findItemContaining(items, "Future Event")).toBeDefined();
    });

    it("shows completed-today history when opt-in is enabled", () => {
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
      const items = buildMeetingMenuTemplate(
        [past, future],
        true,
        { ...baseCallbacks, onAbout, onOpenSettings },
        { kind: "unknown" },
        true,
      );

      expect(findItemContaining(items, "Future Event")).toBeDefined();
      expect(findItem(items, "Completed today")).toBeDefined();
      const history = findItemContaining(items, "Past Event");
      expect(history).toBeDefined();
      expect(history?.label).toContain("Ended");
      expect(history?.enabled).toBe(false);
      expect(history?.submenu).toBeUndefined();
    });

    it("shows only completed history when all meetings have ended and opt-in is on", () => {
      const past = makeEvent({
        title: "Done Meeting",
        startDate: todayAt(10, 0).toISOString(),
        endDate: todayAt(11, 0).toISOString(),
      });
      const items = buildMeetingMenuTemplate(
        [past],
        true,
        { ...baseCallbacks, onAbout, onOpenSettings },
        { kind: "unknown" },
        true,
      );

      expect(findItem(items, "No upcoming meetings")).toBeUndefined();
      expect(findItem(items, "Completed today")).toBeDefined();
      expect(findItemContaining(items, "Done Meeting")?.enabled).toBe(false);
    });

    it("excludes all-day completed meetings from history", () => {
      const allDayPast = makeEvent({
        title: "All Day Done",
        startDate: todayAt(0, 0).toISOString(),
        endDate: todayAt(23, 59).toISOString(),
        isAllDay: true,
      });
      // Force ended: use morning window already past relative to noon fixed tests
      const timedPast = makeEvent({
        id: "2",
        title: "Timed Done",
        startDate: todayAt(9, 0).toISOString(),
        endDate: todayAt(10, 0).toISOString(),
      });
      const items = buildMeetingMenuTemplate(
        [allDayPast, timedPast],
        true,
        { ...baseCallbacks, onAbout, onOpenSettings },
        { kind: "unknown" },
        true,
      );
      expect(findItemContaining(items, "Timed Done")).toBeDefined();
      expect(findItemContaining(items, "All Day Done")).toBeUndefined();
    });
  });

  describe("buildCalendarTrayMenuTemplate completed history", () => {
    it("includes completed-today rows when opt-in is enabled", async () => {
      const mod = await import("../../src/main/menu/meeting-menu.js");
      const past = makeEvent({
        title: "Morning Sync",
        startDate: todayAt(9, 0).toISOString(),
        endDate: todayAt(10, 0).toISOString(),
      });
      const future = makeEvent({
        id: "2",
        title: "Afternoon Sync",
        startDate: todayAt(16, 0).toISOString(),
        endDate: todayAt(17, 0).toISOString(),
      });
      const items = mod.buildCalendarTrayMenuTemplate(
        {
          permission: "granted",
          phase: "ready",
          lastError: null,
          accountEmail: null,
          events: [past, future],
          offline: false,
          oauthConfigured: true,
          cacheAgeMs: null,
        },
        true,
        { ...baseCallbacks, onAbout, onOpenSettings },
        { kind: "unknown" },
        true,
      );
      expect(findItemContaining(items, "Afternoon Sync")).toBeDefined();
      expect(findItem(items, "Completed today")).toBeDefined();
      expect(findItemContaining(items, "Morning Sync")?.label).toContain("Ended");
    });
  });

  // ─── Footer actions (Settings, About, Quit) ──────────────────
  describe("footer actions", () => {
    it("Settings click calls onOpenSettings callback", () => {
      const items = buildMeetingMenuTemplate([], true, {
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
      });

      const settingsItem = findItem(items, "Settings...");
      expect(settingsItem).toBeDefined();
      settingsItem?.click?.({} as Electron.MenuItem, undefined, {} as Electron.KeyboardEvent);

      expect(onOpenSettings).toHaveBeenCalled();
    });

    it("About click calls callbacks.onAbout()", () => {
      const items = buildMeetingMenuTemplate([], true, {
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
      });

      const aboutItem = findItem(items, "About GogMeet");
      expect(aboutItem).toBeDefined();
      aboutItem?.click?.({} as Electron.MenuItem, undefined, {} as Electron.KeyboardEvent);

      expect(onAbout).toHaveBeenCalled();
    });

    it("Quit click calls app.quit()", () => {
      const items = buildMeetingMenuTemplate([], true, {
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
      });

      const quitItem = findItem(items, "Quit");
      expect(quitItem).toBeDefined();
      expect(quitItem?.accelerator).toBe("CommandOrControl+Q");
      quitItem?.click?.({} as Electron.MenuItem, undefined, {} as Electron.KeyboardEvent);

      expect(app.quit).toHaveBeenCalled();
    });

    it("has a separator before Settings at the end (with events)", () => {
      const event = makeEvent({
        startDate: todayAt(15, 0).toISOString(),
        endDate: todayAt(16, 0).toISOString(),
      });
      const items = buildMeetingMenuTemplate([event], true, {
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
      });

      const settingsIdx = items.findIndex((i) => i.label === "Settings...");
      expect(settingsIdx).toBeGreaterThan(0);
      expect(items[settingsIdx - 1]).toEqual({ type: "separator" });
    });
  });

  // ─── Primary actions (Refresh / Join Next / Copy Link / status) ───
  describe("primary tray actions", () => {
    it("includes Refresh, Join Next, Settings, About, Quit in the footer", () => {
      const event = makeEvent({
        startDate: todayAt(15, 0).toISOString(),
        endDate: todayAt(16, 0).toISOString(),
      });
      const items = buildMeetingMenuTemplate([event], true, {
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
      });

      expect(findItem(items, "Join Next Meeting")).toBeDefined();
      expect(findItem(items, "Join Next Meeting")?.enabled).toBe(true);
      expect(findItem(items, "Refresh")).toBeDefined();
      expect(findItem(items, "Settings...")).toBeDefined();
      expect(findItem(items, "About GogMeet")).toBeDefined();
      expect(findItem(items, "Quit")).toBeDefined();
    });

    it("Join Next Meeting joins the earliest upcoming event id", () => {
      const later = makeEvent({
        id: "later",
        title: "Later",
        startDate: todayAt(17, 0).toISOString(),
        endDate: todayAt(18, 0).toISOString(),
      });
      const sooner = makeEvent({
        id: "sooner",
        title: "Sooner",
        startDate: todayAt(15, 0).toISOString(),
        endDate: todayAt(16, 0).toISOString(),
      });
      const items = buildMeetingMenuTemplate([later, sooner], true, {
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
      });
      const joinNext = findItem(items, "Join Next Meeting");
      joinNext?.click?.({} as Electron.MenuItem, undefined, {} as Electron.KeyboardEvent);
      expect(onJoinMeeting).toHaveBeenCalledWith("sooner");
    });

    it("disables Join Next Meeting when no joinable URLs exist", () => {
      const event = makeEvent({
        meetUrl: undefined,
        startDate: todayAt(15, 0).toISOString(),
        endDate: todayAt(16, 0).toISOString(),
      });
      const items = buildMeetingMenuTemplate([event], true, {
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
      });
      expect(findItem(items, "Join Next Meeting")?.enabled).toBe(false);
    });

    it("Copy Link writes the built meet URL to the clipboard", async () => {
      const { clipboard } = await import("electron");
      const writeText = vi.mocked(clipboard.writeText);
      writeText.mockClear();

      const event = makeEvent({
        startDate: todayAt(15, 0).toISOString(),
        endDate: todayAt(16, 0).toISOString(),
        meetUrl: "https://meet.google.com/abc-def-ghi",
      });
      const items = buildMeetingMenuTemplate([event], true, {
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
      });
      const meetingItem = findItemContaining(items, "Standup");
      const submenu = meetingItem?.submenu as MenuItemConstructorOptions[] | undefined;
      const copy = submenu?.find((i) => i.label === "Copy Link");
      copy?.click?.({} as Electron.MenuItem, undefined, {} as Electron.KeyboardEvent);
      expect(writeText).toHaveBeenCalled();
      expect(String(writeText.mock.calls[0]?.[0])).toContain("meet.google.com");
    });

    it("Refresh calls onForcePoll", () => {
      const items = buildMeetingMenuTemplate([], true, {
        ...baseCallbacks,
        onAbout,
        onOpenSettings,
      });
      const refresh = findItem(items, "Refresh");
      refresh?.click?.({} as Electron.MenuItem, undefined, {} as Electron.KeyboardEvent);
      expect(onForcePoll).toHaveBeenCalled();
    });

    it("shows permission-denied status row", () => {
      const items = buildMeetingMenuTemplate(
        [],
        true,
        { ...baseCallbacks, onAbout, onOpenSettings },
        {
          kind: "err",
          error: "denied",
          code: "permission-denied",
          updatedAt: Date.now(),
        },
      );
      expect(findItem(items, "Calendar access denied")).toBeDefined();
      expect(findItem(items, "Open Calendar Privacy Settings…")).toBeDefined();
    });
  });
});

describe("status rows and calendar tray extras", () => {
  let buildCalendarTrayMenuTemplate: typeof import("../../src/main/menu/meeting-menu.js").buildCalendarTrayMenuTemplate;
  let buildMeetingMenuTemplate: typeof import("../../src/main/menu/meeting-menu.js").buildMeetingMenuTemplate;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    // Darwin path uses statusRows (permission-denied Privacy labels). Windows uses Connect Google.
    platformState.darwin = true;
    vi.resetModules();
    const mod = await import("../../src/main/menu/meeting-menu.js");
    buildCalendarTrayMenuTemplate = mod.buildCalendarTrayMenuTemplate;
    buildMeetingMenuTemplate = mod.buildMeetingMenuTemplate;
    onJoinMeeting.mockClear();
    onForcePoll.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("permission-denied status adds access denied row (Darwin)", () => {
    const items = buildCalendarTrayMenuTemplate(
      {
        permission: "denied",
        phase: "error",
        lastError: "denied",
        accountEmail: null,
        events: [],
        offline: false,
        oauthConfigured: true,
      },
      true,
      { ...baseCallbacks, onConnectGoogle: vi.fn(), onRetryPoll: vi.fn() },
      { kind: "err", code: "permission-denied", error: "denied", updatedAt: Date.now() },
    );
    expect(
      items.some(
        (i) =>
          typeof i.label === "string" &&
          (i.label.includes("access denied") || i.label.includes("Privacy")),
      ),
    ).toBe(true);
  });

  it("permission-denied shows Connect Google CTA (Windows)", async () => {
    platformState.darwin = false;
    vi.resetModules();
    const mod = await import("../../src/main/menu/meeting-menu.js");
    buildCalendarTrayMenuTemplate = mod.buildCalendarTrayMenuTemplate;
    const onConnectGoogle = vi.fn();
    const items = buildCalendarTrayMenuTemplate(
      {
        permission: "denied",
        phase: "error",
        lastError: "denied",
        accountEmail: null,
        events: [],
        offline: false,
        oauthConfigured: true,
      },
      true,
      { ...baseCallbacks, onConnectGoogle, onRetryPoll: vi.fn() },
      { kind: "err", code: "permission-denied", error: "denied", updatedAt: Date.now() },
    );
    expect(items.some((i) => i.label === "No calendar connected")).toBe(true);
    const connect = items.find(
      (i) => typeof i.label === "string" && i.label.includes("Reconnect Google"),
    );
    expect(connect).toBeDefined();
    connect?.click?.(undefined as never, undefined as never, undefined as never);
    expect(onConnectGoogle).toHaveBeenCalledOnce();
  });

  it("shows tomorrow section when enabled", () => {
    const tomorrow = makeEvent({
      id: "tmr",
      title: "Tomorrow standup",
      startDate: asTestIsoUtc(tomorrowAt(10).toISOString()),
      endDate: asTestIsoUtc(tomorrowAt(11).toISOString()),
    });
    const items = buildCalendarTrayMenuTemplate(
      {
        permission: "granted",
        phase: "ready",
        lastError: null,
        accountEmail: null,
        events: [tomorrow],
        offline: false,
        oauthConfigured: true,
      },
      true,
      baseCallbacks,
    );
    expect(items.some((i) => i.label === "Tomorrow")).toBe(true);
  });

  it("Join Next and Refresh invoke callbacks", () => {
    const evt = makeEvent({
      meetUrl: "https://meet.google.com/abc-defg-hij" as never,
    });
    const items = buildMeetingMenuTemplate([evt], true, baseCallbacks);
    const joinNext = items.find((i) => i.label === "Join Next Meeting");
    const refresh = items.find((i) => i.label === "Refresh");
    joinNext?.click?.(undefined as never, undefined as never, undefined as never);
    refresh?.click?.(undefined as never, undefined as never, undefined as never);
    expect(onJoinMeeting).toHaveBeenCalled();
    expect(onForcePoll).toHaveBeenCalled();
  });

  it("runtime error status shows retry path labels", () => {
    const onRetryPoll = vi.fn();
    const items = buildCalendarTrayMenuTemplate(
      {
        permission: "granted",
        phase: "error",
        lastError: "network failure",
        accountEmail: null,
        events: null,
        offline: false,
        oauthConfigured: true,
        cacheAgeMs: null,
      },
      false,
      { ...baseCallbacks, onRetryPoll },
      { kind: "err", code: "runtime", error: "network failure", updatedAt: Date.now() },
    );
    const labels = items.map((i) => i.label).filter((l): l is string => typeof l === "string");
    expect(labels.some((l) => l.includes("network failure") || l === "Calendar error")).toBe(true);
    const retry = items.find((i) => i.label === "Retry");
    expect(retry).toBeDefined();
    retry?.click?.(undefined as never, undefined as never, undefined as never);
    expect(onRetryPoll).toHaveBeenCalledOnce();
    // Footer still present for refresh
    expect(items.some((i) => i.label === "Refresh")).toBe(true);
  });

  it("Windows connecting / oauth-not-configured / limited / offline / disconnect paths", async () => {
    platformState.darwin = false;
    vi.resetModules();
    const mod = await import("../../src/main/menu/meeting-menu.js");
    buildCalendarTrayMenuTemplate = mod.buildCalendarTrayMenuTemplate;
    const onDisconnectGoogle = vi.fn();
    const onConnectGoogle = vi.fn();

    const connecting = buildCalendarTrayMenuTemplate(
      {
        permission: "not-determined",
        phase: "connecting",
        lastError: null,
        accountEmail: null,
        events: null,
        offline: false,
        oauthConfigured: true,
        cacheAgeMs: null,
      },
      true,
      { ...baseCallbacks, onConnectGoogle, onDisconnectGoogle },
    );
    expect(connecting.some((i) => i.label === "Connecting to Google…")).toBe(true);

    const noOauth = buildCalendarTrayMenuTemplate(
      {
        permission: "not-determined",
        phase: "disconnected",
        lastError: "config",
        accountEmail: null,
        events: null,
        offline: false,
        oauthConfigured: false,
        cacheAgeMs: null,
      },
      true,
      { ...baseCallbacks, onConnectGoogle },
    );
    expect(noOauth.some((i) => i.label === "No calendar connected")).toBe(true);
    expect(noOauth.some((i) => String(i.label).includes("GOOGLE_OAUTH_CLIENT_ID"))).toBe(true);

    const evt = makeEvent();
    const limited = buildCalendarTrayMenuTemplate(
      {
        permission: "granted",
        phase: "limited",
        lastError: "partial failure",
        accountEmail: "u@example.com",
        events: [evt],
        offline: true,
        oauthConfigured: true,
        cacheAgeMs: 1000,
      },
      true,
      { ...baseCallbacks, onDisconnectGoogle },
    );
    expect(limited.some((i) => String(i.label).includes("Connected as"))).toBe(true);
    expect(limited.some((i) => String(i.label).includes("partial failure"))).toBe(true);
    expect(limited.some((i) => String(i.label).includes("Offline"))).toBe(true);
    const disconnect = limited.find((i) => i.label === "Disconnect Google Calendar");
    expect(disconnect).toBeDefined();
    disconnect?.click?.(undefined as never, undefined as never, undefined as never);
    expect(onDisconnectGoogle).toHaveBeenCalledOnce();
  });

  it("Darwin loading label when permission undetermined and events null", async () => {
    platformState.darwin = true;
    vi.resetModules();
    const mod = await import("../../src/main/menu/meeting-menu.js");
    buildCalendarTrayMenuTemplate = mod.buildCalendarTrayMenuTemplate;
    const items = buildCalendarTrayMenuTemplate(
      {
        permission: "not-determined",
        phase: "disconnected",
        lastError: null,
        accountEmail: null,
        events: null,
        offline: false,
        oauthConfigured: false,
        cacheAgeMs: null,
      },
      true,
      baseCallbacks,
    );
    expect(items.some((i) => i.label === "Loading…")).toBe(true);
  });
});
