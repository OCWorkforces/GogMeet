
/** Application settings */
export interface AppSettings {
  /** Schema version for migrations */
  schemaVersion: number;
  /** Minutes before meeting start to auto-open browser (1-5) */
  openBeforeMinutes: number;
  /** Whether to launch the app at login (auto-start on system restart) */
  launchAtLogin: boolean;
  /** Whether to show tomorrow's meetings in the popover */
  showTomorrowMeetings: boolean;
  /** Whether to show a window alert when a meeting starts */
  windowAlert: boolean;
}

/** Default settings values */
export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: 1,
  openBeforeMinutes: 1,
  launchAtLogin: false,
  showTomorrowMeetings: true,
  windowAlert: true,
};

/** Valid range for openBeforeMinutes */
export const OPEN_BEFORE_MINUTES_MIN = 1;
export const OPEN_BEFORE_MINUTES_MAX = 5;
