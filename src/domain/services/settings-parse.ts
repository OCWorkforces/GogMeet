/**
 * Pure settings record parse/clamp/migrate — no FS or Electron.
 */

import {
  DEFAULT_SETTINGS,
  OPEN_BEFORE_MINUTES_MIN,
  OPEN_BEFORE_MINUTES_MAX,
  ALERT_LEAD_SECONDS_MIN,
  ALERT_LEAD_SECONDS_MAX,
  LATE_JOIN_GRACE_MINUTES_MIN,
  LATE_JOIN_GRACE_MINUTES_MAX,
  SETTINGS_SCHEMA_VERSION,
  isHHmm,
  type AppSettings,
} from "../entities/settings.js";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Parse a loose record into AppSettings with defaults, clamps, and legacy field migration.
 */
export function parseSettingsRecord(parsed: Record<string, unknown>): AppSettings {
  // Migrate legacy fullScreenAlert → windowAlert
  if (
    typeof parsed["fullScreenAlert"] === "boolean" &&
    typeof parsed["windowAlert"] !== "boolean"
  ) {
    parsed["windowAlert"] = parsed["fullScreenAlert"];
  }

  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    openBeforeMinutes: clamp(
      typeof parsed["openBeforeMinutes"] === "number"
        ? parsed["openBeforeMinutes"]
        : DEFAULT_SETTINGS.openBeforeMinutes,
      OPEN_BEFORE_MINUTES_MIN,
      OPEN_BEFORE_MINUTES_MAX,
    ),
    launchAtLogin:
      typeof parsed["launchAtLogin"] === "boolean"
        ? parsed["launchAtLogin"]
        : DEFAULT_SETTINGS.launchAtLogin,
    showTomorrowMeetings:
      typeof parsed["showTomorrowMeetings"] === "boolean"
        ? parsed["showTomorrowMeetings"]
        : DEFAULT_SETTINGS.showTomorrowMeetings,
    windowAlert:
      typeof parsed["windowAlert"] === "boolean"
        ? parsed["windowAlert"]
        : DEFAULT_SETTINGS.windowAlert,
    autoOpenEnabled:
      typeof parsed["autoOpenEnabled"] === "boolean"
        ? parsed["autoOpenEnabled"]
        : DEFAULT_SETTINGS.autoOpenEnabled,
    alertLeadSeconds: clamp(
      typeof parsed["alertLeadSeconds"] === "number"
        ? parsed["alertLeadSeconds"]
        : DEFAULT_SETTINGS.alertLeadSeconds,
      ALERT_LEAD_SECONDS_MIN,
      ALERT_LEAD_SECONDS_MAX,
    ),
    nativeNotifications:
      typeof parsed["nativeNotifications"] === "boolean"
        ? parsed["nativeNotifications"]
        : DEFAULT_SETTINGS.nativeNotifications,
    lateJoinGraceMinutes: clamp(
      typeof parsed["lateJoinGraceMinutes"] === "number"
        ? parsed["lateJoinGraceMinutes"]
        : DEFAULT_SETTINGS.lateJoinGraceMinutes,
      LATE_JOIN_GRACE_MINUTES_MIN,
      LATE_JOIN_GRACE_MINUTES_MAX,
    ),
    quietHoursEnabled:
      typeof parsed["quietHoursEnabled"] === "boolean"
        ? parsed["quietHoursEnabled"]
        : DEFAULT_SETTINGS.quietHoursEnabled,
    quietHoursStart:
      typeof parsed["quietHoursStart"] === "string" && isHHmm(parsed["quietHoursStart"])
        ? parsed["quietHoursStart"]
        : DEFAULT_SETTINGS.quietHoursStart,
    quietHoursEnd:
      typeof parsed["quietHoursEnd"] === "string" && isHHmm(parsed["quietHoursEnd"])
        ? parsed["quietHoursEnd"]
        : DEFAULT_SETTINGS.quietHoursEnd,
  };
}
