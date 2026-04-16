import "./styles/main.css";
import type { MeetingEvent } from "../shared/models.js";
import type { CalendarPermission } from "../shared/models.js";
import type { AppSettings } from "../shared/settings.js";
import { DEFAULT_SETTINGS } from "../shared/settings.js";
import { isTomorrow } from "../shared/utils/time.js";
import { renderBody } from "./rendering/body.js";
import { setupDelegatedEvents } from "./events/delegation.js";

type AppState =
  | { type: "loading" }
  | { type: "no-permission"; retrying: boolean }
  | { type: "no-events" }
  | { type: "has-events"; events: MeetingEvent[] }
  | { type: "error"; message: string };

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let state: AppState = { type: "loading" };
let version = "";
let settings: AppSettings = { ...DEFAULT_SETTINGS };
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let lastUpdatedAt: number | null = null;
let cachedSettings: AppSettings | null = null;
let cachedPermission: CalendarPermission | null = null;
let lastHeight = 0;
let lastEventsKey = "";
let lastPollTime = 0;

function formatLastUpdated(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Updated just now";
  if (diffMin === 1) return "Updated 1 min ago";
  return `Updated ${diffMin} min ago`;
}

function renderFooter(): string {
  const isLoading = lastUpdatedAt === null;
  const label = isLoading ? "Loading…" : formatLastUpdated(lastUpdatedAt!);
  const icon = isLoading
    ? ""
    : '<span class="footer-refresh-icon" aria-hidden="true">↻</span>';
  return `
    <footer class="footer">
      <span class="footer-version">v${version}</span>
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
        <div class="body">${renderBody(state, settings)}</div>
        ${renderFooter()}
      </div>`;

    // Measure actual rendered height and resize the Electron BrowserWindow
    const FOOTER_H = 32;
    const MIN_H = 220;
    const MAX_H = 480;
    const bodyEl = app.querySelector<HTMLElement>(".body");
    const bodyH = bodyEl ? bodyEl.scrollHeight : 0;
    const targetH = Math.min(MAX_H, Math.max(MIN_H, bodyH + FOOTER_H));
    if (targetH !== lastHeight) {
      window.api.window.setHeight(targetH);
      lastHeight = targetH;
    }
  } catch (error) {
    console.error('[renderer] Render error:', error);
  }
}

async function grantAccess() {
  state = { type: "no-permission", retrying: true };
  render();

  const status = await window.api.calendar.requestPermission();
  cachedPermission = status;
  if (status === "granted") {
    await loadEvents();
  } else {
    state = { type: "no-permission", retrying: false };
    render();
  }
}

async function loadEvents() {
  const prevStateType = state.type;
  state = { type: "loading" };
  render();

  try {
    // Fetch settings first
    settings = cachedSettings ?? await window.api.settings.get();
    cachedSettings = settings;

    const permission = cachedPermission ?? await window.api.calendar.getPermissionStatus();
    cachedPermission = permission;

    if (permission === "denied" || permission === "not-determined") {
      state = { type: "no-permission", retrying: false };
      render();
      return;
    }

    const result = await window.api.calendar.getEvents();

    if ("error" in result) {
      state = { type: "error", message: result.error };
    } else {
      // Filter events based on settings
      let events = result.events;
      if (!settings.showTomorrowMeetings) {
        events = events.filter((e) => !isTomorrow(e.startDate));
      }

      if (events.length === 0) {
        state = { type: "no-events" };
      } else {
        const key = events.map((e) => e.id + e.startDate + e.endDate + e.meetUrl).join("|");
        if (key === lastEventsKey && prevStateType === "has-events") {
          lastUpdatedAt = Date.now();
          return;
        }
        lastEventsKey = key;
        state = { type: "has-events", events };
      }
    }
  } catch (err) {
    state = {
      type: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }

  lastUpdatedAt = Date.now();
  render();
}

async function init() {
  setupDelegatedEvents({
    onLoadEvents: () => void loadEvents(),
    onGrantAccess: () => void grantAccess(),
    onOpenExternal: (url) => window.api.app.openExternal(url),
  });
  // Listen for calendar updates pushed from main process
  window.api.calendar.onEventsUpdated(() => void loadEvents());
  // Listen for settings changes from the settings window
  window.api.settings.onChanged((updated: AppSettings) => {
    cachedSettings = updated;
    void loadEvents();
  });
  version = await window.api.app.getVersion();

  // Initial load
  await loadEvents();

  // Auto-refresh every 5 minutes
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => loadEvents(), REFRESH_INTERVAL_MS);

  // Pause refresh when window hidden, resume when visible
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    } else {
      // Resumed — debounce rapid show/hide cycles (5s minimum)
      const now = Date.now();
      if (now - lastPollTime >= 5000) {
        lastPollTime = now;
        void loadEvents();
      }
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = setInterval(() => loadEvents(), REFRESH_INTERVAL_MS);
    }
  });

  // Keyboard accessibility: Escape closes, Enter/Space activates focused button
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    const active = document.activeElement as HTMLElement | null;
    switch (e.key) {
      case "Escape":
        window.blur?.();
        break;
      case "Enter":
      case " ":
        if (active?.dataset["action"]) {
          e.preventDefault();
          active.click();
        }
        break;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => init());
