/** Application settings */
export interface AppSettings {
  /** Schema version for migrations */
  schemaVersion: number;
  /** Minutes before meeting start to auto-open browser (0-10; 0 = at start) */
  openBeforeMinutes: number;
  /** Whether to launch the app at login (auto-start on system restart) */
  launchAtLogin: boolean;
  /** Whether to show tomorrow's meetings in the tray menu */
  showTomorrowMeetings: boolean;
  /** Whether to show a window alert before auto-open */
  windowAlert: boolean;
  /** Whether browser auto-open is armed for timed meetings with URLs */
  autoOpenEnabled: boolean;
  /** Seconds before browser open to show the window alert */
  alertLeadSeconds: number;
  /** Whether to show OS Notification when browser opens */
  nativeNotifications: boolean;
  /** Minutes after start to still auto-open (0 = off) */
  lateJoinGraceMinutes: number;
  /** Suppress alert + notifications during quiet hours (auto-open continues) */
  quietHoursEnabled: boolean;
  /** Quiet hours start local "HH:mm" */
  quietHoursStart: string;
  /** Quiet hours end local "HH:mm" (may wrap past midnight) */
  quietHoursEnd: string;
}

export const SETTINGS_SCHEMA_VERSION = 2 as const;

/** Default settings values */
export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  openBeforeMinutes: 1,
  launchAtLogin: false,
  showTomorrowMeetings: true,
  windowAlert: true,
  autoOpenEnabled: true,
  alertLeadSeconds: 60,
  nativeNotifications: true,
  lateJoinGraceMinutes: 0,
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
};

/** Valid range for openBeforeMinutes */
export const OPEN_BEFORE_MINUTES_MIN = 0;
export const OPEN_BEFORE_MINUTES_MAX = 10;

export const ALERT_LEAD_SECONDS_MIN = 0;
export const ALERT_LEAD_SECONDS_MAX = 300;

export const LATE_JOIN_GRACE_MINUTES_MIN = 0;
export const LATE_JOIN_GRACE_MINUTES_MAX = 15;

/** HH:mm local time */
export function isHHmm(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

/**
 * Returns true if local `date` falls inside quiet hours (supports start > end wrap).
 */
export function isInQuietHours(date: Date, startHHmm: string, endHHmm: string): boolean {
  const toMinutes = (s: string): number | null => {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const start = toMinutes(startHHmm);
  const end = toMinutes(endHHmm);
  if (start === null || end === null) return false;
  const now = date.getHours() * 60 + date.getMinutes();
  if (start === end) return false;
  if (start < end) {
    return now >= start && now < end;
  }
  return now >= start || now < end;
}
