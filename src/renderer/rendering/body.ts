import type { AppSettings } from "../../shared/settings.js";
import { escapeHtml } from "../../shared/utils/escape-html.js";
import { isTomorrow } from "../../shared/utils/time.js";

import type { AppState } from "../../shared/app-state.js";

function formatRelativeTime(
  startDate: string,
  endDate: string,
): { label: string; cls: string } {
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

export function renderBody(s: AppState, settings: AppSettings): string {
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

      const parts: string[] = [];
      if (upcoming.length > 0) {
        parts.push(`<p class="section-header">${sectionHeader}</p>`);
        upcoming.forEach((event, i) => {
          const rel = formatRelativeTime(event.startDate, event.endDate);
          const autoJoin = !event.isAllDay && !!event.meetUrl;
          parts.push(`
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
          `);
          if (i < upcoming.length - 1)
            parts.push(`<div class="meeting-divider"></div>`);
        });
      }

      if (past.length > 0 && upcoming.length === 0) {
        parts.push(`
          <div class="state-screen">
            <div class="state-icon">✅</div>
            <p class="state-title">All done for today!</p>
            <p class="state-desc">No more upcoming meetings.</p>
          </div>
        `);
      }

      return parts.join("");
    }
  }
}
