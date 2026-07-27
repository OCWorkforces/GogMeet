import type { BrowserWindow } from "electron";
import type { EventId } from "../../domain/entities/brand.js";
import type { CalendarPermission, CalendarResult } from "../../domain/entities/calendar-result.js";
import type { CalendarUiState } from "../../domain/entities/calendar-ui-state.js";
import type { MeetingEvent } from "../../domain/entities/meeting-event.js";
import type { AppSettings } from "../../domain/entities/settings.js";
import type { Result } from "../../domain/entities/result.js";
import type { MeetingOpenerPort } from "../application/ports/meeting-opener-port.js";
import type { PowerCallbacks } from "../scheduler/state/index.js";
import { createShellMeetingOpener } from "../infrastructure/electron/shell-meeting-opener.js";
import {
  getCalendarEventsResult,
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
} from "../scheduler/facade.js";
import { bindComposition } from "./bind-composition.js";

/** Calendar surface exposed on the app graph. */
export interface AppGraphCalendar {
  getEvents(): Promise<CalendarResult>;
  requestPermission(): Promise<CalendarPermission>;
  getPermissionStatus(): Promise<CalendarPermission>;
  disconnect(): Promise<void>;
  getUiState(): CalendarUiState;
  warmup(): Promise<void>;
  invalidatePermissionCache(): void;
  shouldAutoRequestPermission(): boolean;
  reportPollError(error: string, lastEvents: MeetingEvent[] | null): void;
}

/** Settings surface on the app graph. */
export interface AppGraphSettings {
  load(): Promise<Result<AppSettings, string>>;
  get(): AppSettings;
  update(partial: Partial<AppSettings>): Promise<AppSettings>;
  save(settings: AppSettings): Promise<void>;
}

/** Scheduler surface on the app graph. */
export interface AppGraphScheduler {
  forcePoll(): Promise<void>;
  getLastKnownEvents(): CalendarResult | null;
  cancelPendingBrowserOpen(id: EventId): void;
  start(): void;
  stop(options?: { preserveFiredState?: boolean }): void;
  restart(): void;
  setWindow(w: BrowserWindow): void;
  setTrayTitleCallback(
    fn: (title: string | null, minsRemaining?: number, inMeeting?: boolean) => void,
  ): void;
  initPowerCallbacks(callbacks: PowerCallbacks): void;
}

/** Watcher surface on the app graph. */
export interface AppGraphWatcher {
  start(): void;
  stop(): void;
  revive(): void;
}

/**
 * Composition root: production wiring for main-process use cases and adapters.
 * Construction is pure wiring — no network/OAuth; start/stop stay in lifecycle.
 */
export interface AppGraph {
  readonly calendar: AppGraphCalendar;
  readonly settings: AppGraphSettings;
  readonly join: {
    byId(id: EventId): Promise<Result<void, string>>;
  };
  readonly opener: MeetingOpenerPort;
  readonly scheduler: AppGraphScheduler;
  readonly watcher: AppGraphWatcher;
}

export interface CreateAppGraphOptions {
  /** Skip rebinding free-function defaults (tests that mock facades). */
  readonly skipBind?: boolean;
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
      getEvents: () => getCalendarEventsResult(),
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
      forcePoll: () => forcePoll(),
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
