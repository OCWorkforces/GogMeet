import type { AppGraph, CreateAppGraphOptions } from "./app-graph.js";
import { createAppGraph } from "./app-graph.js";
import type { MeetingOpenerPort } from "../application/ports/meeting-opener-port.js";

export interface AppGraphOverrides {
  calendar?: Partial<AppGraph["calendar"]>;
  settings?: Partial<AppGraph["settings"]>;
  join?: Partial<AppGraph["join"]>;
  opener?: MeetingOpenerPort;
  scheduler?: Partial<AppGraph["scheduler"]>;
  watcher?: Partial<AppGraph["watcher"]>;
}

/**
 * Build an AppGraph for tests, optionally overriding nested surfaces.
 * Defaults to skipBind so mocked facades are not rebound.
 */
export function createTestAppGraph(
  overrides: AppGraphOverrides = {},
  options: CreateAppGraphOptions = { skipBind: true },
): AppGraph {
  const base = createAppGraph({ skipBind: true, ...options });
  return {
    calendar: { ...base.calendar, ...overrides.calendar },
    settings: { ...base.settings, ...overrides.settings },
    join: { ...base.join, ...overrides.join },
    opener: overrides.opener ?? base.opener,
    scheduler: { ...base.scheduler, ...overrides.scheduler },
    watcher: { ...base.watcher, ...overrides.watcher },
  };
}
