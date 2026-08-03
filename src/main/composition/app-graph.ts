import type { BrowserWindow } from "electron";
import type { EventId } from "../../domain/entities/brand.js";
import type { CalendarPermission, CalendarResult } from "../../domain/entities/calendar-result.js";
import type { CalendarPublication } from "../../domain/entities/calendar-publication.js";
import type { CalendarUiState } from "../../domain/entities/calendar-ui-state.js";
import type { MeetingEvent } from "../../domain/entities/meeting-event.js";
import type { AppSettings } from "../../domain/entities/settings.js";
import type { Result } from "../../domain/entities/result.js";
import type { MeetingOpenerPort } from "../application/ports/meeting-opener-port.js";
import type { PowerCallbacks } from "../scheduler/state/index.js";
import { createShellMeetingOpener } from "../infrastructure/electron/shell-meeting-opener.js";
import {
  getCalendarEventsResult,
  refreshCalendarPublication,
  requestCalendarPermission,
  getCalendarPermissionStatus,
  disconnectCalendar,
  getCalendarUiState,
  warmupCalendarProvider,
  invalidateCalendarPermissionCache,
  shouldAutoRequestCalendarPermission,
  reportCalendarPollError,
} from "../facades/calendar.js";
import {
  startCalendarWatcher,
  stopCalendarWatcher,
  reviveCalendarWatcher,
} from "../facades/calendar-watcher.js";
import { getSettings, loadSettings, updateSettings, saveSettings } from "../facades/settings.js";
import { joinMeetingById } from "../utils/join-meeting.js";
import {
  forcePoll,
  getLastKnownEvents,
  cancelPendingBrowserOpen,
  startScheduler,
  stopScheduler,
  restartScheduler,
  setSchedulerWindow,
  setTrayTitleCallback,
  initPowerCallbacks,
  type ForcePollOptions,
} from "../scheduler/facade.js";
import { bindComposition } from "./bind-composition.js";

/** Calendar surface exposed on the app graph. */
export interface AppGraphCalendar {
  /** Coordinated refresh; returns publication envelope for IPC/renderer. */
  getEvents(): Promise<CalendarPublication>;
  /** Result-only coordinated refresh for join/shortcuts. */
  getEventsResult(): Promise<CalendarResult>;
  /** Trigger permission flow (Darwin TCC / Windows OAuth from tray or Settings). */
  requestPermission(): Promise<CalendarPermission>;
  /** Current permission without prompting when a status is already cached. */
  getPermissionStatus(): Promise<CalendarPermission>;
  /** Disconnect Google account / reset the active provider and related UI state. */
  disconnect(): Promise<void>;
  /** Synchronous UI-state snapshot for tray menu and settings rendering. */
  getUiState(): CalendarUiState;
  /** Pre-warm the active provider (Swift compile on Darwin / soft token refresh on Google). */
  warmup(): Promise<void>;
  /** Drop cached permission so the next status check re-queries the provider. */
  invalidatePermissionCache(): void;
  /** Whether lifecycle may auto-prompt when status is not-determined (Darwin only). */
  shouldAutoRequestPermission(): boolean;
  /** Publish a poll-level failure into UI state, optionally retaining last events. */
  reportPollError(error: string, lastEvents: MeetingEvent[] | null): void;
}

/** Settings surface on the app graph. */
export interface AppGraphSettings {
  /** Load settings from disk into the in-memory store. */
  load(): Promise<Result<AppSettings, string>>;
  /** Synchronous in-memory settings snapshot. */
  get(): AppSettings;
  /** Merge a partial update, persist, and return the new settings. */
  update(partial: Partial<AppSettings>): Promise<AppSettings>;
  /** Persist a full settings object (no merge). */
  save(settings: AppSettings): Promise<void>;
}

/** Scheduler surface on the app graph. */
export interface AppGraphScheduler {
  /**
   * Coordinated poll; returns the publication when the poll completes.
   * Pass `{ reason: "user" }` for tray Refresh (bypasses 10s auto coalesce).
   */
  forcePoll(options?: ForcePollOptions): Promise<CalendarPublication | null>;
  /** Cached last poll result for join/shortcuts without starting a refresh. */
  getLastKnownEvents(): CalendarResult | null;
  /** Cancel a pending auto-open timer and mark the event fired (e.g. alert dismiss). */
  cancelPendingBrowserOpen(id: EventId): void;
  /** Start background polling (idempotent while already running). */
  start(): void;
  /** Stop polling and clear timers; optionally preserve fired/alert suppression state. */
  stop(options?: { preserveFiredState?: boolean }): void;
  /** Stop then start, preserving suppression state across the cycle. */
  restart(): void;
  /** Inject the BrowserWindow used for calendar result IPC pushes. */
  setWindow(w: BrowserWindow): void;
  /** Tray title callback for countdown / in-meeting display updates. */
  setTrayTitleCallback(
    fn: (title: string | null, minsRemaining?: number, inMeeting?: boolean) => void,
  ): void;
  /** Power-management hooks (poll interval, sleep prevention). */
  initPowerCallbacks(callbacks: PowerCallbacks): void;
}

/** Watcher surface on the app graph. */
export interface AppGraphWatcher {
  /** Start provider calendar-change watch (when supported). */
  start(): void;
  /** Stop the active watch. */
  stop(): void;
  /** Re-arm watch after resume / provider revive. */
  revive(): void;
}

/**
 * Composition root: production wiring for main-process use cases and adapters.
 * Construction is pure wiring — no network/OAuth; start/stop stay in lifecycle.
 */
export interface AppGraph {
  /** Calendar use cases and coordinated refresh. */
  readonly calendar: AppGraphCalendar;
  /** Settings load/get/update/save. */
  readonly settings: AppGraphSettings;
  /** Allowlisted meeting join hub. */
  readonly join: {
    /** Open a meeting by event id and suppress duplicate auto-open. */
    byId(id: EventId): Promise<Result<void, string>>;
  };
  /** Shell-backed meeting URL opener (egress allowlist). */
  readonly opener: MeetingOpenerPort;
  /** Polling, auto-open, alerts, and tray countdown. */
  readonly scheduler: AppGraphScheduler;
  /** Provider calendar-change watch lifecycle. */
  readonly watcher: AppGraphWatcher;
}

export interface CreateAppGraphOptions {
  /** Skip rebinding free-function defaults (tests that mock facades). */
  readonly skipBind?: boolean;
  /** Override the default shell meeting opener (tests / alternate adapters). */
  readonly opener?: MeetingOpenerPort;
}

/**
 * Build the production app graph and rebind free-function defaults.
 */
export function createAppGraph(options: CreateAppGraphOptions = {}): AppGraph {
  if (!options.skipBind) {
    bindComposition();
  }

  const opener = options.opener ?? createShellMeetingOpener();

  return {
    calendar: {
      getEvents: () => refreshCalendarPublication(),
      getEventsResult: () => getCalendarEventsResult(),
      requestPermission: () => requestCalendarPermission(),
      getPermissionStatus: () => getCalendarPermissionStatus(),
      disconnect: () => disconnectCalendar(),
      getUiState: () => getCalendarUiState(),
      warmup: () => warmupCalendarProvider(),
      invalidatePermissionCache: () => {
        invalidateCalendarPermissionCache();
      },
      shouldAutoRequestPermission: () => shouldAutoRequestCalendarPermission(),
      reportPollError: (error, lastEvents) => {
        reportCalendarPollError(error, lastEvents);
      },
    },
    settings: {
      load: () => loadSettings(),
      get: () => getSettings(),
      update: (partial) => updateSettings(partial),
      save: (settings) => saveSettings(settings),
    },
    join: {
      byId: (id) => joinMeetingById(id),
    },
    opener,
    scheduler: {
      forcePoll: (options) => forcePoll(options),
      getLastKnownEvents: () => getLastKnownEvents(),
      cancelPendingBrowserOpen: (id) => {
        cancelPendingBrowserOpen(id);
      },
      start: () => {
        startScheduler();
      },
      stop: (options) => {
        stopScheduler(options);
      },
      restart: () => {
        restartScheduler();
      },
      setWindow: (w) => {
        setSchedulerWindow(w);
      },
      setTrayTitleCallback: (fn) => {
        setTrayTitleCallback(fn);
      },
      initPowerCallbacks: (callbacks) => {
        initPowerCallbacks(callbacks);
      },
    },
    watcher: {
      start: () => {
        startCalendarWatcher();
      },
      stop: () => {
        stopCalendarWatcher();
      },
      revive: () => {
        reviveCalendarWatcher();
      },
    },
  };
}
