import type { AppSettings } from "../../domain/entities/settings.js";
import type { MeetingEvent } from "../../domain/entities/meeting-event.js";
import { escapeHtml } from "../../shared/utils/escape-html.js";
import { isTomorrow, startOfDay } from "../../domain/services/time.js";
import {
  filterUpcomingMeetings,
  isMeetingInProgress,
  isMeetingNotEnded,
} from "../../domain/services/meeting-time.js";

import type { AppState } from "../../shared/app-state.js";

function formatRelativeTime(event: MeetingEvent, nowMs: number): { label: string; cls: string } {
  const start = new Date(event.startDate).getTime();
  const end = new Date(event.endDate).getTime();
  const diffMs = start - nowMs;
  const diffMin = Math.round(diffMs / 60000);

  if (isMeetingInProgress(event, nowMs)) {
    return { label: "In progress", cls: "now" };
  }

  if (!isMeetingNotEnded(event, nowMs) || nowMs >= end) {
    return { label: "Ended", cls: "" };
  }

  if (diffMin < 1) {
    return { label: "Starting now!", cls: "now" };
  }
  if (diffMin <= 15) {
    return { label: `In ${diffMin} min`, cls: "soon" };
  }

  const startTime = new Date(event.startDate);
  const hours = startTime.getHours().toString().padStart(2, "0");
  const minutes = startTime.getMinutes().toString().padStart(2, "0");
  return { label: `${hours}:${minutes}`, cls: "" };
}

/**
 * True when both local start and end fall on the local calendar day of `nowMs`
 * and the meeting has already ended (`endMs <= nowMs`).
 * Excludes overnight, prior-day, and multi-day spanning events.
 */
export function isCompletedTodayMeeting(event: MeetingEvent, nowMs: number): boolean {
  const startMs = new Date(event.startDate).getTime();
  const endMs = new Date(event.endDate).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  if (endMs > nowMs) return false;

  const dayStart = startOfDay(new Date(nowMs));
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayEnd.getTime();
  return startMs >= dayStartMs && startMs < dayEndMs && endMs >= dayStartMs && endMs < dayEndMs;
}

/** Completed-today events, newest-ended first. */
export function filterCompletedTodayMeetings(
  events: readonly MeetingEvent[],
  nowMs: number,
): MeetingEvent[] {
  return events
    .filter((e) => isCompletedTodayMeeting(e, nowMs))
    .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());
}

function renderCompletedHistoryRow(event: MeetingEvent): string {
  return `
            <div class="meeting-item meeting-item--completed">
              <div class="meeting-item-row">
                <span class="meeting-title" title="${escapeHtml(event.title)}">${escapeHtml(event.title)}</span>
              </div>
              <div class="meeting-item-row">
                <span class="meeting-time">Ended</span>
                <span class="meeting-meta">
                  <span class="meeting-cal">${escapeHtml(event.calendarName)}</span>
                </span>
              </div>
            </div>
          `;
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
      const upcoming = filterUpcomingMeetings(s.events, now);
      const hasPastEvents = s.events.some((e) => !isMeetingNotEnded(e, now));
      const completedToday = settings.showCompletedTodayMeetings
        ? filterCompletedTodayMeetings(s.events, now)
        : [];

      // Check if any upcoming event is tomorrow
      const hasTomorrowEvents = upcoming.some((e) => isTomorrow(e.startDate));
      const sectionHeader = hasTomorrowEvents ? "Today & Tomorrow" : "Today";

      const parts: string[] = [];
      if (upcoming.length > 0) {
        parts.push(`<p class="section-header">${sectionHeader}</p>`);
        upcoming.forEach((event, i) => {
          const rel = formatRelativeTime(event, now);
          const autoJoin = !event.isAllDay && !!event.meetUrl;
          parts.push(`
            <div class="meeting-item">
              <div class="meeting-item-row">
                <span class="meeting-title" title="${escapeHtml(event.title)}">${escapeHtml(event.title)}</span>
                ${event.meetUrl ? `<button class="btn-join" data-action="join-meeting" data-event-id="${escapeHtml(event.id)}" aria-label="Join ${escapeHtml(event.title)}">Join</button>` : ""}
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
          if (i < upcoming.length - 1) parts.push(`<div class="meeting-divider"></div>`);
        });
      }

      if (hasPastEvents && upcoming.length === 0 && completedToday.length === 0) {
        parts.push(`
          <div class="state-screen">
            <div class="state-icon">✅</div>
            <p class="state-title">All done for today!</p>
            <p class="state-desc">No more upcoming meetings.</p>
          </div>
        `);
      }

      if (completedToday.length > 0) {
        parts.push(`<p class="section-header">Completed today</p>`);
        completedToday.forEach((event, i) => {
          parts.push(renderCompletedHistoryRow(event));
          if (i < completedToday.length - 1) parts.push(`<div class="meeting-divider"></div>`);
        });
      }

      return parts.join("");
    }
  }
}
