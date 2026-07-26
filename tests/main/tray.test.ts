import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MeetingEvent } from "../../src/shared/meeting-event.js";
import { createMockEvent as createSharedMockEvent, asTestIsoUtc } from "../helpers/test-utils.js";

type MockTrayInstance = {
  setToolTip: ReturnType<typeof vi.fn>;
  setTitle: ReturnType<typeof vi.fn>;
  setImage: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  getBounds: ReturnType<typeof vi.fn>;
  popUpContextMenu: ReturnType<typeof vi.fn>;
  setContextMenu: ReturnType<typeof vi.fn>;
};

vi.mock("electron", () => ({
  Tray: vi.fn().mockImplementation(function (this: MockTrayInstance) {
    this.setToolTip = vi.fn();
    this.setTitle = vi.fn();
    this.setImage = vi.fn();
    this.on = vi.fn();
    this.getBounds = vi
      .fn()
      .mockReturnValue({ x: 100, y: 0, width: 22, height: 22 });
    this.popUpContextMenu = vi.fn();
    this.setContextMenu = vi.fn();
  }),
  Menu: { buildFromTemplate: vi.fn().mockReturnValue({}) },
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) },
  app: { quit: vi.fn(), showAboutPanel: vi.fn(), once: vi.fn() },
  nativeImage: {
    createFromPath: vi
      .fn()
      .mockReturnValue({ toPNG: vi.fn().mockReturnValue(Buffer.alloc(0)), isEmpty: vi.fn().mockReturnValue(false) }),
    createEmpty: vi.fn().mockReturnValue({ addRepresentation: vi.fn(), isEmpty: vi.fn().mockReturnValue(true) }),
  },
  nativeTheme: { shouldUseDarkColors: false, on: vi.fn() },
  BrowserWindow: vi.fn().mockImplementation(function (this: {
    on: ReturnType<typeof vi.fn>;
  }) {
    this.on = vi.fn();
  }),
}));

vi.mock("../../src/main/domain/calendar.js", () => ({
  getCalendarEventsResult: vi.fn().mockResolvedValue({ kind: "ok", events: [] }),
  getCalendarUiState: vi.fn().mockReturnValue({
    permission: "not-determined",
    phase: "disconnected",
    lastError: null,
    accountEmail: null,
    events: null,
    offline: false,
    oauthConfigured: false,
  }),
  requestCalendarPermission: vi.fn().mockResolvedValue("granted"),
  disconnectCalendar: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/main/scheduler/facade.js", () => ({
  forcePoll: vi.fn(),
}));

vi.mock("../../src/main/utils/meet-url.js", () => ({
  buildMeetUrl: vi.fn((event: MeetingEvent) => event.meetUrl || ""),
}));

vi.mock("../../src/main/windows/about-window.js", () => ({
  showAbout: vi.fn(),
}));

vi.mock("../../src/main/domain/settings.js", () => ({
  getSettings: vi.fn().mockReturnValue({ showTomorrowMeetings: true }),
}));

const platformState = vi.hoisted(() => ({ darwin: true }));

vi.mock("../../src/main/platform/os.js", () => ({
  isDarwin: () => platformState.darwin,
  isWin32: () => !platformState.darwin,
}));

// Helper to create mock event
function createMockEvent(
  overrides: Partial<MeetingEvent> = {},
): MeetingEvent {
  const now = new Date();
  const in1Hour = new Date(now.getTime() + 60 * 60 * 1000);
  return createSharedMockEvent({
    startDate: asTestIsoUtc(now.toISOString()),
    endDate: asTestIsoUtc(in1Hour.toISOString()),
    ...overrides,
  });
}

function isMockTrayInstance(value: unknown): value is MockTrayInstance {
  if (typeof value !== "object" || value === null) return false;
  return "setToolTip" in value && "setContextMenu" in value;
}

function getLatestTrayInstance(Tray: typeof import("electron").Tray): MockTrayInstance {
  const results = vi.mocked(Tray).mock.results;
  const latestResult = results[results.length - 1];
  if (!latestResult || latestResult.type === "throw" || !isMockTrayInstance(latestResult.value)) {
    throw new Error("Tray was not constructed by the test setup");
  }
  return latestResult.value;
}

// Pure function tests - formatRemainingTime
describe("formatRemainingTime", () => {
  let formatRemainingTime: (totalMins: number) => string;

  beforeEach(async () => {
    vi.resetModules();
    const timeModule = await import("../../src/shared/utils/time.js");
    formatRemainingTime = timeModule.formatRemainingTime;
  });

  it("returns '0m' for zero or negative minutes", () => {
    expect(formatRemainingTime(0)).toBe("0m");
    expect(formatRemainingTime(-1)).toBe("0m");
    expect(formatRemainingTime(-100)).toBe("0m");
  });

  it("formats minutes only when < 60", () => {
    expect(formatRemainingTime(1)).toBe("1m");
    expect(formatRemainingTime(30)).toBe("30m");
    expect(formatRemainingTime(59)).toBe("59m");
  });

  it("formats hours only when exactly on the hour", () => {
    expect(formatRemainingTime(60)).toBe("1h");
    expect(formatRemainingTime(120)).toBe("2h");
    expect(formatRemainingTime(180)).toBe("3h");
  });

  it("formats hours and minutes when both present", () => {
    expect(formatRemainingTime(61)).toBe("1h 1m");
    expect(formatRemainingTime(90)).toBe("1h 30m");
    expect(formatRemainingTime(125)).toBe("2h 5m");
    expect(formatRemainingTime(3665)).toBe("61h 5m");
  });

  it("formats 0 as '0m'", () => {
    expect(formatRemainingTime(0)).toBe("0m");
  });
});

// Tray module exports
describe("tray module exports", () => {
  beforeEach(() => {
    vi.resetModules();
    platformState.darwin = true;
  });

  it("exports setupTray and updateTrayTitle functions", async () => {
    const trayModule = await import("../../src/main/tray.js");

    expect(typeof trayModule.setupTray).toBe("function");
    expect(typeof trayModule.updateTrayTitle).toBe("function");
    expect(typeof trayModule.truncateTrayTooltip).toBe("function");
    expect(typeof trayModule.buildWindowsTrayTooltip).toBe("function");
    expect(typeof trayModule.formatTrayCountdownLabel).toBe("function");
  });

  it("truncateTrayTooltip caps length with ellipsis", async () => {
    const { truncateTrayTooltip } = await import("../../src/main/tray.js");
    expect(truncateTrayTooltip("short")).toBe("short");
    expect(truncateTrayTooltip("a".repeat(70), 10)).toBe("aaaaaaaaa\u2026");
  });

  it("buildWindowsTrayTooltip formats idle, offline, and countdown", async () => {
    const { buildWindowsTrayTooltip, TRAY_TOOLTIP_MAX_CHARS } = await import(
      "../../src/main/tray.js"
    );
    expect(buildWindowsTrayTooltip(null)).toBe("GogMeet");
    expect(buildWindowsTrayTooltip(null, undefined, undefined, true)).toBe(
      "GogMeet — Offline",
    );
    expect(buildWindowsTrayTooltip("Standup", 15)).toBe("GogMeet — Standup in 15 mins");
    const long = buildWindowsTrayTooltip("A".repeat(80), 5);
    expect(long.length).toBeLessThanOrEqual(TRAY_TOOLTIP_MAX_CHARS);
  });

  it("setupTray creates a Tray instance", async () => {
    const { setupTray } = await import("../../src/main/tray.js");
    const { Tray } = await import("electron");

    const mockWindow = {} as Parameters<typeof setupTray>[0];
    setupTray(mockWindow);

    expect(Tray).toHaveBeenCalled();
  });

  it("setupTray sets tooltip to 'Google Meet'", async () => {
    const { setupTray } = await import("../../src/main/tray.js");
    const { Tray } = await import("electron");

    const mockWindow = {} as Parameters<typeof setupTray>[0];
    setupTray(mockWindow);

    const trayInstance = getLatestTrayInstance(Tray);
    expect(trayInstance.setToolTip).toHaveBeenCalledWith("GogMeet");
  });

  it("setupTray registers nativeTheme.on('updated') handler", async () => {
    const { setupTray } = await import("../../src/main/tray.js");
    const { nativeTheme } = await import("electron");

    const mockWindow = {} as Parameters<typeof setupTray>[0];
    setupTray(mockWindow);

    expect(nativeTheme.on).toHaveBeenCalledWith(
      "updated",
      expect.any(Function),
    );
  });

  it("registers before-quit handler only once even when setupTray is called multiple times", async () => {
    const { setupTray } = await import("../../src/main/tray.js");
    const { app } = await import("electron");

    // Clear accumulated calls from prior tests in this file before counting
    vi.mocked(app.once).mockClear();

    const mockWindow = {} as Parameters<typeof setupTray>[0];
    setupTray(mockWindow);           // First call: registers before-quit
    setupTray(mockWindow);           // Second call: should skip

    const beforeQuitCalls = vi.mocked(app.once).mock.calls.filter(
      (c: unknown[]) => c[0] === "before-quit",
    );
    expect(beforeQuitCalls).toHaveLength(1);
  });

  it("installs a context menu during setup so the first tray click has a menu", async () => {
    const { setupTray } = await import("../../src/main/tray.js");
    const { BrowserWindow, Menu, Tray } = await import("electron");

    // Given: the tray is being created before any calendar cache has arrived.
    const mockWindow = new BrowserWindow();

    // When: setup registers the tray item.
    setupTray(mockWindow);

    // Then: the native tray menu is already installed for the first status-item activation.
    const trayInstance = getLatestTrayInstance(Tray);
    expect(Menu.buildFromTemplate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ label: "Loading…", enabled: false }),
      ]),
    );
    expect(trayInstance.setContextMenu).toHaveBeenCalledWith({});
  });

  it("refreshes the installed context menu when cached meetings change", async () => {
    const { setupTray } = await import("../../src/main/tray.js");
    const { mainBus } = await import("../../src/main/events.js");
    const { BrowserWindow, Tray } = await import("electron");

    // Given: a tray exists with its initial loading menu installed.
    const mockWindow = new BrowserWindow();
    setupTray(mockWindow);
    const trayInstance = getLatestTrayInstance(Tray);
    vi.mocked(trayInstance.setContextMenu).mockClear();

    // When: the scheduler publishes fresh cached meetings.
    mainBus.emit("meeting-list-updated", [createMockEvent()]);

    // Then: the already-installed native menu is rebuilt for the next click.
    expect(trayInstance.setContextMenu).toHaveBeenCalledWith({});
  });

  it("on Windows left-click forcePolls and popUpContextMenu", async () => {
    platformState.darwin = false;
    const { setupTray } = await import("../../src/main/tray.js");
    const { forcePoll } = await import("../../src/main/scheduler/facade.js");
    const { BrowserWindow, Tray } = await import("electron");

    const mockWindow = new BrowserWindow();
    setupTray(mockWindow);
    const trayInstance = getLatestTrayInstance(Tray);

    const clickHandler = vi.mocked(trayInstance.on).mock.calls.find((c) => c[0] === "click")?.[1] as
      | (() => void)
      | undefined;
    expect(clickHandler).toBeTypeOf("function");
    clickHandler?.();

    expect(forcePoll).toHaveBeenCalled();
    expect(trayInstance.popUpContextMenu).toHaveBeenCalled();
  });

  it("on Darwin left-click forcePolls without popUpContextMenu", async () => {
    platformState.darwin = true;
    const { setupTray } = await import("../../src/main/tray.js");
    const { forcePoll } = await import("../../src/main/scheduler/facade.js");
    const { BrowserWindow, Tray } = await import("electron");

    vi.mocked(forcePoll).mockClear();
    const mockWindow = new BrowserWindow();
    setupTray(mockWindow);
    const trayInstance = getLatestTrayInstance(Tray);
    vi.mocked(trayInstance.popUpContextMenu).mockClear();

    const clickHandler = vi.mocked(trayInstance.on).mock.calls.find((c) => c[0] === "click")?.[1] as
      | (() => void)
      | undefined;
    clickHandler?.();

    expect(forcePoll).toHaveBeenCalled();
    expect(trayInstance.popUpContextMenu).not.toHaveBeenCalled();
  });
});

