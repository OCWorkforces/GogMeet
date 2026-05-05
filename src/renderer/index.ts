import "./styles/main.css";
import type { CalendarPermission, MeetingEvent } from "../shared/models.js";
import { isCalendarOk } from "../shared/models.js";
import type { AppSettings } from "../shared/settings.js";
import { DEFAULT_SETTINGS } from "../shared/settings.js";
import { isTomorrow } from "../shared/utils/time.js";
import { renderBody } from "./rendering/body.js";
import { setupDelegatedEvents } from "./events/delegation.js";

import type { AppState } from "../shared/app-state.js";

// Layout constants for window height calculation
const FOOTER_H = 32;
const MIN_H = 220;
const MAX_H = 480;

interface RendererState {
  state: AppState;
  version: string;
  settings: AppSettings;
  lastUpdatedAt: number | null;
  cachedSettings: AppSettings | null;
  cachedPermission: CalendarPermission | null;
  lastHeight: number;
  lastEventsKey: string;
  lastPollTime: number;
}

const rs: RendererState = {
  state: { type: "loading" },
  version: "",
  settings: { ...DEFAULT_SETTINGS },
  lastUpdatedAt: null,
  cachedSettings: null,
  cachedPermission: null,
  lastHeight: 0,
  lastEventsKey: "",
  lastPollTime: Date.now(),
};

function formatLastUpdated(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Updated just now";
  if (diffMin === 1) return "Updated 1 min ago";
  return `Updated ${diffMin} min ago`;
}

function renderFooter(): string {
  const label = rs.lastUpdatedAt === null ? "Loading…" : formatLastUpdated(rs.lastUpdatedAt);
  const isLoading = rs.lastUpdatedAt === null;
  const icon = isLoading ? "" : '<span class="footer-refresh-icon" aria-hidden="true">↻</span>';
  return `
    <footer class="footer">
      <span class="footer-version">v${rs.version}</span>
      <span class="footer-sep" aria-hidden="true"></span>
      <button class="footer-refresh${isLoading ? " footer-refresh--loading" : ""}" data-action="refresh" aria-label="Refresh meetings">
        ${icon}<span class="footer-refresh-label">${label}</span>
      </button>
    </footer>
  `;
}

function render() {
  try {
    const app = document.getElementById("app");
    if (!app) return;

    app.innerHTML = `<div role="dialog" aria-label="GogMeet meetings" aria-live="polite">
        <div class="body">${renderBody(rs.state, rs.settings)}</div>
        ${renderFooter()}
      </div>`;

    // Measure actual rendered height and resize the Electron BrowserWindow
    const bodyEl = app.querySelector<HTMLElement>(".body");
    const bodyH = bodyEl ? bodyEl.scrollHeight : 0;
    const targetH = Math.min(MAX_H, Math.max(MIN_H, bodyH + FOOTER_H));
    if (targetH !== rs.lastHeight) {
      window.api.window.setHeight(targetH);
      rs.lastHeight = targetH;
    }
  } catch (error) {
    console.error("[renderer] Render error:", error);
  }
}

async function grantAccess() {
  rs.state = { type: "no-permission", retrying: true };
  render();

  const status = await window.api.calendar.requestPermission();
  rs.cachedPermission = status;
  if (status === "granted") {
    await loadEvents();
  } else {
    rs.state = { type: "no-permission", retrying: false };
    render();
  }
}

async function loadEvents() {
  const prevStateType = rs.state.type;
  rs.state = { type: "loading" };
  render();

  try {
    // Fetch settings and permission in parallel — they are independent
    const [fetchedSettings, fetchedPermission] = await Promise.all([
      rs.cachedSettings ?? window.api.settings.get(),
      rs.cachedPermission ?? window.api.calendar.getPermissionStatus(),
    ]);
    rs.settings = fetchedSettings;
    rs.cachedSettings = fetchedSettings;
    rs.cachedPermission = fetchedPermission;

    if (fetchedPermission === "denied" || fetchedPermission === "not-determined") {
      rs.state = { type: "no-permission", retrying: false };
      render();
      return;
    }

    const result = await window.api.calendar.getEvents();

    if (!isCalendarOk(result)) {
      rs.state = { type: "error", message: result.error };
    } else {
      // Filter events based on settings
      let events = result.events;
      if (!rs.settings.showTomorrowMeetings) {
        events = events.filter((e) => !isTomorrow(e.startDate));
      }

      if (events.length === 0) {
        rs.state = { type: "no-events" };
      } else {
        const key = events.map((e) => e.id + e.startDate + e.endDate + e.meetUrl).join("|");
        if (key === rs.lastEventsKey && prevStateType === "has-events") {
          rs.lastUpdatedAt = Date.now();
          return;
        }
        rs.lastEventsKey = key;
        rs.state = { type: "has-events", events };
      }
    }
  } catch (err) {
    rs.state = {
      type: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }

  rs.lastUpdatedAt = Date.now();
  render();
}

async function init() {
  setupDelegatedEvents({
    onForcePoll: () => {
      window.api.scheduler.forcePoll();
      // loadEvents() will be triggered by CALENDAR_EVENTS_UPDATED push from main.
      // For error/no-permission states (no push arrives), also reload directly.
      if (rs.state.type === "error" || rs.state.type === "no-permission") {
        void loadEvents();
      }
    },
    onGrantAccess: () => void grantAccess(),
    onOpenExternal: (url) => window.api.app.openExternal(url),
  });

  // Listen for calendar updates pushed from main process — events included in push payload
  window.api.calendar.onEventsUpdated((events: MeetingEvent[]) => {
    // Apply showTomorrowMeetings filter (same logic as loadEvents)
    let filtered = events;
    if (!rs.settings.showTomorrowMeetings) {
      filtered = events.filter((e) => !isTomorrow(e.startDate));
    }

    if (filtered.length === 0) {
      rs.state = { type: "no-events" };
    } else {
      rs.lastEventsKey = filtered.map((e) => e.id + e.startDate + e.endDate + e.meetUrl).join("|");
      rs.state = { type: "has-events", events: filtered };
    }
    rs.lastUpdatedAt = Date.now();
    render();
  });

  // Listen for settings changes from the settings window
  window.api.settings.onChanged((updated: AppSettings) => {
    rs.cachedSettings = updated;
    rs.settings = updated;
    void loadEvents();
  });

  rs.version = await window.api.app.getVersion();

  // Initial load
  await loadEvents();

  // Resume on show with debounce to avoid rapid show/hide cycles
  // No 5-min polling interval — main pushes updates via CALENDAR_EVENTS_UPDATED
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      const now = Date.now();
      if (now - rs.lastPollTime >= 5000) {
        rs.lastPollTime = now;
        void loadEvents();
      }
    }
  });

  // Keyboard accessibility: Escape closes, Enter/Space activates focused button
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      window.blur?.();
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.dataset["action"]) {
        e.preventDefault();
        active.click();
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", () => init());
