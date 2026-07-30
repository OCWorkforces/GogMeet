import "./styles/main.css";
import type { CalendarPermission } from "../domain/entities/calendar-result.js";
import { isCalendarOk } from "../domain/entities/calendar-result.js";
import type { CalendarPublication } from "../domain/entities/calendar-publication.js";
import type { AppSettings } from "../domain/entities/settings.js";
import { DEFAULT_SETTINGS } from "../domain/entities/settings.js";
import { renderBody } from "./rendering/body.js";
import { setupDelegatedEvents } from "./events/delegation.js";
import { applyEventsPush } from "./lib/apply-events-push.js";

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
  lastEventsSignature: string;
  lastPollTime: number;
  /** Defense-in-depth: ignore stale publications with older generations. */
  loadGeneration: number;
}

const rs: RendererState = {
  state: { type: "loading" },
  version: "",
  settings: { ...DEFAULT_SETTINGS },
  lastUpdatedAt: null,
  cachedSettings: null,
  cachedPermission: null,
  lastHeight: 0,
  lastEventsSignature: "",
  lastPollTime: Date.now(),
  loadGeneration: 0,
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

function applyPublication(publication: CalendarPublication, prevState: AppState): void {
  if (publication.publicationGeneration < rs.loadGeneration) {
    return;
  }
  rs.loadGeneration = publication.publicationGeneration;
  const result = publication.result;
  if (!isCalendarOk(result)) {
    rs.state = { type: "error", message: result.error };
    return;
  }
  const applied = applyEventsPush({
    events: result.events,
    settings: rs.settings,
    prevState,
    prevSignature: rs.lastEventsSignature,
  });
  if (!applied.didChange) {
    rs.state = applied.state;
    return;
  }
  rs.lastEventsSignature = applied.signature;
  rs.state = applied.state;
}

/**
 * Single refresh path: await coordinated publication from main (no separate forcePoll).
 */
async function loadEvents() {
  const prevState = rs.state;
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

    const publication = await window.api.calendar.getEvents();
    applyPublication(publication, prevState);
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
      // Single path: coordinated GET_EVENTS (main schedules + returns publication).
      void loadEvents();
    },
    onGrantAccess: () => void grantAccess(),
    onJoinMeeting: (eventId) => {
      void window.api.app.joinMeeting(eventId).then((result) => {
        if (!result.ok) {
          console.error("[renderer] Join failed:", result.error);
        }
      });
    },
  });

  // Main pushes full publications after polls / coordinated refreshes.
  window.api.calendar.onResultUpdated((publication: CalendarPublication) => {
    applyPublication(publication, rs.state);
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

  // On show: always re-render from cached state so ended meetings drop immediately.
  // Soft "In N min" / end membership while open is driven by main display-horizon
  // pushes (CALENDAR_RESULT_UPDATED). Network refresh remains debounced.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      // Local re-filter with Date.now() — no loading flash, no network required.
      render();
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
