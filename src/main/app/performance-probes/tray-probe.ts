/**
 * Packaged tray rebuild probe — drives production setupTray + mainBus + rebuild.
 * Synthetic markers only (no real titles/URLs).
 */

import { BrowserWindow } from "electron";

import { asEventId, asIsoUtc } from "../../../domain/entities/brand.js";
import type { MeetingEvent } from "../../../domain/entities/meeting-event.js";
import type { CalendarUiState } from "../../../domain/entities/calendar-ui-state.js";
import { createAppGraph } from "../../composition/app-graph.js";
import { mainBus } from "../../events.js";
import { destroyTray, setupTray, requestTrayRebuild } from "../../tray.js";
import {
  SECURE_WEB_PREFERENCES,
  getPreloadPath,
} from "../../utils/browser-window.js";
import { flushPerfTraceToUserData } from "../../utils/performance-trace-file.js";
import { perfTrace } from "../../utils/performance-trace.js";

function syntheticEvents(count: number, nowMs: number): MeetingEvent[] {
  const events: MeetingEvent[] = [];
  for (let i = 0; i < count; i++) {
    const start = new Date(nowMs + (i + 1) * 60_000).toISOString();
    const end = new Date(nowMs + (i + 1) * 60_000 + 30 * 60_000).toISOString();
    const id = asEventId(`syn-tray-${i}`);
    const s = asIsoUtc(start);
    const e = asIsoUtc(end);
    if (!id.ok || !s.ok || !e.ok) continue;
    events.push({
      id: id.value,
      title: `m-${i}`,
      startDate: s.value,
      endDate: e.value,
      calendarName: "probe",
      isAllDay: false,
    });
  }
  return events;
}

function syntheticUi(events: MeetingEvent[]): CalendarUiState {
  return {
    permission: "granted",
    phase: events.length > 0 ? "ready" : "empty",
    lastError: null,
    accountEmail: null,
    events,
    offline: false,
    oauthConfigured: true,
    cacheAgeMs: null,
  };
}

/**
 * Run tray measurement bursts for sizes 20/200/1000 through production path.
 */
export async function runTrayProbe(userDataPath: string): Promise<void> {
  const win = new BrowserWindow({
    show: false,
    width: 1,
    height: 1,
    webPreferences: {
      preload: getPreloadPath(),
      ...SECURE_WEB_PREFERENCES,
    },
  });
  try {
    const graph = createAppGraph();
    setupTray(win, graph);

    const sizes = [20, 200, 1000] as const;
    const now = Date.now();
    for (const n of sizes) {
      const events = syntheticEvents(n, now);
      const ui = syntheticUi(events);
      // Warm + 10 source bursts (dual signals coalesce).
      for (let b = 0; b < 10; b++) {
        mainBus.emit("meeting-list-updated", events);
        mainBus.emit("calendar-status-updated", ui);
        await Promise.resolve();
        await Promise.resolve();
      }
      // 30 measured force rebuilds
      for (let i = 0; i < 30; i++) {
        const t0 = performance.now();
        requestTrayRebuild(win, { force: true });
        await Promise.resolve();
        await Promise.resolve();
        perfTrace({
          operation: "tray-rebuild",
          outcome: "ok",
          startMs: t0,
          durationMs: Math.max(0, performance.now() - t0),
          count: n,
        });
      }
    }
    flushPerfTraceToUserData(userDataPath);
  } finally {
    destroyTray();
    if (!win.isDestroyed()) {
      win.destroy();
    }
  }
}
