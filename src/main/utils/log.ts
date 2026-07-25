import log from "electron-log";
import type Logger from "electron-log";
import { app } from "electron";

let configured = false;

/**
 * Configure electron-log once for main-process file + console transport.
 * Safe to call multiple times.
 */
export function configureMainLogging(): void {
  if (configured) return;
  configured = true;
  log.transports.file.level = "info";
  log.transports.console.level = "info";
  try {
    if (app?.isReady?.()) {
      log.transports.file.resolvePathFn = (): string => `${app.getPath("logs")}/main.log`;
    }
  } catch {
    // app may be unavailable in unit tests
  }
}

export const mainLog: Logger.LogFunctions = log.scope("main");
export const schedulerLog: Logger.LogFunctions = log.scope("scheduler");
export const calendarLog: Logger.LogFunctions = log.scope("calendar");
