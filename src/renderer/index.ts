import './styles/main.css';
import type { MeetingEvent } from '../shared/types.js';

type AppState =
  | { type: 'loading' }
  | { type: 'no-permission'; retrying: boolean }
  | { type: 'no-events' }
  | { type: 'has-events'; events: MeetingEvent[] }
  | { type: 'error'; message: string };

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let state: AppState = { type: 'loading' };
let version = '';
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let lastUpdatedAt: number | null = null;

function formatRelativeTime(isoDate: string): { label: string; cls: string } {
  const now = Date.now();
  const start = new Date(isoDate).getTime();
  const diffMs = start - now;
  const diffMin = Math.round(diffMs / 60000);

  if (diffMs < 0 && Math.abs(diffMs) < 30 * 60000) {
    return { label: 'In progress', cls: 'now' };
  }
  if (diffMin <= 0) {
    return { label: 'Ended', cls: '' };
  }
  if (diffMin < 1) {
    return { label: 'Starting now!', cls: 'now' };
  }
  if (diffMin <= 15) {
    return { label: `In ${diffMin} min`, cls: 'soon' };
  }

  const startTime = new Date(isoDate);
  const hours = startTime.getHours().toString().padStart(2, '0');
  const minutes = startTime.getMinutes().toString().padStart(2, '0');
  return { label: `${hours}:${minutes}`, cls: '' };
}



function formatLastUpdated(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Updated just now';
  if (diffMin === 1) return 'Updated 1 min ago';
  return `Updated ${diffMin} min ago`;
}

function renderFooter(): string {
  const label = lastUpdatedAt === null
    ? 'Loading...'
    : formatLastUpdated(lastUpdatedAt);
  return `
    <div class="footer">
      <span class="footer-version">v${version}</span>
      <button class="footer-refresh" data-action="refresh">${label}</button>
    </div>
  `;
}

function renderBody(s: AppState): string {
  switch (s.type) {
    case 'loading':
      return `
        <div class="state-screen">
          <div class="spinner"></div>
          <p class="state-desc">Loading your meetings...</p>
        </div>
      `;

    case 'no-permission':
      return `
        <div class="state-screen">
          <div class="state-icon">📅</div>
          <p class="state-title">Calendar Access Needed</p>
          <p class="state-desc">GiMeet needs access to your calendar to show upcoming events.</p>
          <button class="btn-primary" id="btn-grant" data-action="grant-access" ${s.retrying ? 'disabled' : ''}>
            ${s.retrying ? 'Requesting...' : 'Grant Access'}
          </button>
        </div>
      `;

    case 'no-events':
      return `
        <div class="state-screen">
          <div class="state-icon">☕</div>
          <p class="state-title">No upcoming meetings</p>
          <p class="state-desc">No calendar events found for today or tomorrow.</p>
        </div>
      `;

    case 'error':
      return `
        <div class="state-screen">
          <div class="state-icon">⚠️</div>
          <p class="state-title">Something went wrong</p>
          <p class="state-desc">${escapeHtml(s.message)}</p>
          <button class="btn-primary" id="btn-retry" data-action="retry">Try Again</button>
        </div>
      `;

    case 'has-events': {
      const now = Date.now();
      const upcoming = s.events.filter(
        (e) => new Date(e.endDate).getTime() > now
      );
      const past = s.events.filter(
        (e) => new Date(e.endDate).getTime() <= now
      );

      let html = '';

      if (upcoming.length > 0) {
        html += `<p class="section-header">Today & Tomorrow</p>`;
        upcoming.forEach((event, i) => {
          const rel = formatRelativeTime(event.startDate);
          const autoJoin = !event.isAllDay && !!event.meetUrl;
          html += `
            <div class="meeting-item">
              <div class="meeting-item-row">
                <span class="meeting-title" title="${escapeHtml(event.title)}">${escapeHtml(event.title)}</span>
                ${event.meetUrl ? `<button class="btn-join" data-action="join-meeting" data-url="${escapeHtml(event.meetUrl)}">Join</button>` : ''}
              </div>
              <div class="meeting-item-row">
                <span class="meeting-time ${rel.cls}">${rel.label}</span>
                <span class="meeting-meta">
                  ${autoJoin ? '<span class="badge-auto" title="Browser will open automatically 1 min before">⚡ Auto</span>' : ''}
                  <span class="meeting-cal">${escapeHtml(event.calendarName)}</span>
                </span>
              </div>
            </div>
          `;
          if (i < upcoming.length - 1) html += `<div class="meeting-divider"></div>`;
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function render() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `<div class="body">${renderBody(state)}</div>` + renderFooter();

}

function setupDelegatedEvents(): void {
  const container = document.getElementById('app');
  if (!container) return;

  container.addEventListener('click', (e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;

    const action = target.dataset['action'];
    switch (action) {
      case 'refresh':
      case 'retry':
        void loadEvents();
        break;
      case 'grant-access':
        void grantAccess();
        break;
      case 'join-meeting': {
        const url = target.dataset['url'];
        if (url) window.api.app.openExternal(url);
        break;
      }
    }
  });
}

async function grantAccess() {
  state = { type: 'no-permission', retrying: true };
  render();

  const status = await window.api.calendar.requestPermission();
  if (status === 'granted') {
    await loadEvents();
  } else {
    state = { type: 'no-permission', retrying: false };
    render();
  }
}

async function loadEvents() {
  state = { type: 'loading' };
  render();

  try {
    const permission = await window.api.calendar.getPermissionStatus();

    if (permission === 'denied' || permission === 'not-determined') {
      state = { type: 'no-permission', retrying: false };
      render();
      return;
    }

    const events = await window.api.calendar.getEvents();

    if (events.length === 0) {
      state = { type: 'no-events' };
    } else {
      state = { type: 'has-events', events };
    }
  } catch (err) {
    state = {
      type: 'error',
      message: err instanceof Error ? err.message : 'Unknown error',
    };
  }

  render();
  lastUpdatedAt = Date.now();
}

async function init() {
  setupDelegatedEvents();
  version = await window.api.app.getVersion();

  // Initial load
  await loadEvents();

  // Auto-refresh every 5 minutes
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => loadEvents(), REFRESH_INTERVAL_MS);

  // Pause refresh when window hidden, resume when visible
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    } else {
      // Resumed — reload immediately then restart interval
      void loadEvents();
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = setInterval(() => loadEvents(), REFRESH_INTERVAL_MS);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => init());
