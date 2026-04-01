import "./styles/main.css";
import type { MeetingEvent } from "../shared/models.js";
import type { CalendarPermission } from "../shared/models.js";
import type { AppSettings } from "../shared/settings.js";
import { escapeHtml } from "../shared/utils/escape-html.js";

type AppState =
  | { type: "loading" }
  | { type: "no-permission"; retrying: boolean }
  | { type: "no-events" }
  | { type: "has-events"; events: MeetingEvent[] }
  | { type: "error"; message: string };

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let state: AppState = { type: "loading" };
let version = "";
let settings: AppSettings = {
  schemaVersion: 1,
  openBeforeMinutes: 1,
  launchAtLogin: false,
  showTomorrowMeetings: true,
  windowAlert: false,
};
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let lastUpdatedAt: number | null = null;
let cachedSettings: AppSettings | null = null;
let cachedPermission: CalendarPermission | null = null;
let lastHeight = 0;
let lastEventsKey = "";
let lastPollTime = 0;

function formatRelativeTime(startDate: string, endDate: string): { label: string; cls: string } {
  const now = Date.now();
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const diffMs = start - now;
  const diffMin = Math.round(diffMs / 60000);

  // Meeting is in progress (started but not ended)
  if (start <= now && now < end) {
    return { label: "In progress", cls: "now" };
  }

  // Meeting has ended
  if (now >= end) {
    return { label: "Ended", cls: "" };
  }

  if (diffMin < 1) {
    return { label: "Starting now!", cls: "now" };
  }
  if (diffMin <= 15) {
    return { label: `In ${diffMin} min`, cls: "soon" };
  }

  const startTime = new Date(startDate);
  const hours = startTime.getHours().toString().padStart(2, "0");
  const minutes = startTime.getMinutes().toString().padStart(2, "0");
  return { label: `${hours}:${minutes}`, cls: "" };
}

function formatLastUpdated(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Updated just now";
  if (diffMin === 1) return "Updated 1 min ago";
  return `Updated ${diffMin} min ago`;
}

/** Check if a date is tomorrow (local time) */
function isTomorrow(isoDate: string): boolean {
  const date = new Date(isoDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(tomorrow);
  dayAfter.setDate(dayAfter.getDate() + 1);
  return date >= tomorrow && date < dayAfter;
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

function renderBody(s: AppState): string {
  switch (s.type) {
    case "loading":
      return `
        <div class="state-screen">
          <div class="spinner"></div>
          <p class="state-desc">Loading your meetings...</p>
        </div>
      `;

    case "no-permission":
      return `
        <div class="state-screen">
          <div class="state-icon">📅</div>
          <p class="state-title">Calendar Access Needed</p>
          <p class="state-desc">GogMeet needs access to your calendar to show upcoming events.</p>
          <button class="btn-primary" id="btn-grant" data-action="grant-access" ${s.retrying ? "disabled" : ""}>
            ${s.retrying ? "Requesting..." : "Grant Access"}
          </button>
        </div>
      `;

    case "no-events":
      return `
        <div class="state-screen">
          <div class="state-icon">☕</div>
          <p class="state-title">No upcoming meetings</p>
          <p class="state-desc">${settings.showTomorrowMeetings ? "No calendar events found for today or tomorrow." : "No calendar events found for today."}</p>
        </div>
      `;

    case "error":
      return `
        <div class="state-screen">
          <div class="state-icon">⚠️</div>
          <p class="state-title">Something went wrong</p>
          <p class="state-desc">${escapeHtml(s.message)}</p>
          <button class="btn-primary" id="btn-retry" data-action="retry">Try Again</button>
        </div>
      `;

    case "has-events": {
      const now = Date.now();
      const upcoming = s.events.filter(
        (e) => new Date(e.endDate).getTime() > now,
      );
      const past = s.events.filter((e) => new Date(e.endDate).getTime() <= now);

      // Check if any upcoming event is tomorrow
      const hasTomorrowEvents = upcoming.some((e) => isTomorrow(e.startDate));
      const sectionHeader = hasTomorrowEvents ? "Today & Tomorrow" : "Today";

      let html = "";
      if (upcoming.length > 0) {
        html += `<p class="section-header">${sectionHeader}</p>`;
        upcoming.forEach((event, i) => {
          const rel = formatRelativeTime(event.startDate, event.endDate);
          const autoJoin = !event.isAllDay && !!event.meetUrl;
          html += `
            <div class="meeting-item">
              <div class="meeting-item-row">
                <span class="meeting-title" title="${escapeHtml(event.title)}">${escapeHtml(event.title)}</span>
                ${event.meetUrl ? `<button class="btn-join" data-action="join-meeting" data-url="${escapeHtml(event.meetUrl)}">Join</button>` : ""}
              </div>
              <div class="meeting-item-row">
                <span class="meeting-time ${rel.cls}">${rel.label}</span>
                <span class="meeting-meta">
                  ${autoJoin ? `<span class="badge-auto" title="Browser will open automatically ${settings.openBeforeMinutes === 1 ? "1 min" : `${settings.openBeforeMinutes} mins`} before">⚡ Auto</span>` : ""}
                  <span class="meeting-cal">${escapeHtml(event.calendarName)}</span>
                </span>
              </div>
            </div>
          `;
          if (i < upcoming.length - 1)
            html += `<div class="meeting-divider"></div>`;
        });
      }

      if (past.length > 0 && upcoming.length === 0) {
        html += `
          <div class="state-screen">
            <div class="state-icon">✅</div>
            <p class="state-title">All done for today!</p>
            <p class="state-desc">No more upcoming meetings.</p>
          </div>
        `;
      }

      return html;
    }
  }
}

function render() {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = `<div role="dialog" aria-label="GogMeet meetings" aria-live="polite">
      <div class="body">${renderBody(state)}</div>
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
}

function setupDelegatedEvents(): void {
  const container = document.getElementById("app");
  if (!container) return;

  container.addEventListener("click", (e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(
      "[data-action]",
    );
    if (!target) return;

    const action = target.dataset["action"];
    switch (action) {
      case "refresh":
      case "retry":
        void loadEvents();
        break;
      case "grant-access":
        void grantAccess();
        break;
      case "join-meeting": {
        const url = target.dataset["url"];
        if (url) window.api.app.openExternal(url);
        break;
      }
    }
  });
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
  setupDelegatedEvents();
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
