import './styles/main.css';
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let state = { type: 'loading' };
let version = '';
let refreshTimer = null;
function formatRelativeTime(isoDate) {
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
function renderHeader() {
    return `
    <div class="header">
      <span class="header-title">GiMeet</span>
      <div class="header-actions">
        <button class="btn-icon" id="btn-refresh" title="Refresh">↺</button>
        <button class="btn-icon" id="btn-close" title="Close">×</button>
      </div>
    </div>
  `;
}
function renderFooter() {
    return `
    <div class="footer">
      <span class="footer-version">v${version}</span>
      <button class="footer-refresh" id="footer-refresh">Last updated just now</button>
    </div>
  `;
}
function renderBody(s) {
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
          <p class="state-desc">GiMeet needs access to your calendar to find Google Meet events.</p>
          <button class="btn-primary" id="btn-grant" ${s.retrying ? 'disabled' : ''}>
            ${s.retrying ? 'Requesting...' : 'Grant Access'}
          </button>
        </div>
      `;
        case 'no-events':
            return `
        <div class="state-screen">
          <div class="state-icon">☕</div>
          <p class="state-title">No upcoming meetings</p>
          <p class="state-desc">No Google Meet events found for today or tomorrow.</p>
        </div>
      `;
        case 'error':
            return `
        <div class="state-screen">
          <div class="state-icon">⚠️</div>
          <p class="state-title">Something went wrong</p>
          <p class="state-desc">${escapeHtml(s.message)}</p>
          <button class="btn-primary" id="btn-retry">Try Again</button>
        </div>
      `;
        case 'has-events': {
            const now = Date.now();
            const upcoming = s.events.filter((e) => new Date(e.endDate).getTime() > now);
            const past = s.events.filter((e) => new Date(e.endDate).getTime() <= now);
            let html = '';
            if (upcoming.length > 0) {
                html += `<p class="section-header">Today & Tomorrow</p>`;
                upcoming.forEach((event, i) => {
                    const rel = formatRelativeTime(event.startDate);
                    html += `
            <div class="meeting-item">
              <div class="meeting-item-row">
                <span class="meeting-title" title="${escapeHtml(event.title)}">${escapeHtml(event.title)}</span>
                <button class="btn-join" data-url="${escapeHtml(event.meetUrl)}">Join</button>
              </div>
              <div class="meeting-item-row">
                <span class="meeting-time ${rel.cls}">${rel.label}</span>
                <span class="meeting-cal">${escapeHtml(event.calendarName)}</span>
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
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
function render() {
    const app = document.getElementById('app');
    if (!app)
        return;
    app.innerHTML = renderHeader() + `<div class="body">${renderBody(state)}</div>` + renderFooter();
    bindEvents();
}
function bindEvents() {
    document.getElementById('btn-refresh')?.addEventListener('click', () => loadEvents());
    document.getElementById('footer-refresh')?.addEventListener('click', () => loadEvents());
    document.getElementById('btn-close')?.addEventListener('click', () => {
        const app = document.getElementById('app');
        if (app) {
            app.classList.add('hiding');
            app.addEventListener('transitionend', () => window.api.window.minimizeToTray(), { once: true });
        }
        else {
            window.api.window.minimizeToTray();
        }
    });
    document.getElementById('btn-grant')?.addEventListener('click', () => grantAccess());
    document.getElementById('btn-retry')?.addEventListener('click', () => loadEvents());
    document.querySelectorAll('.btn-join').forEach((btn) => {
        btn.addEventListener('click', () => {
            const url = btn.dataset['url'];
            if (url)
                window.api.app.openExternal(url);
        });
    });
}
async function grantAccess() {
    state = { type: 'no-permission', retrying: true };
    render();
    const status = await window.api.calendar.requestPermission();
    if (status === 'granted') {
        await loadEvents();
    }
    else {
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
        }
        else {
            state = { type: 'has-events', events };
        }
    }
    catch (err) {
        state = {
            type: 'error',
            message: err instanceof Error ? err.message : 'Unknown error',
        };
    }
    render();
}
async function init() {
    version = await window.api.app.getVersion();
    // Initial load
    await loadEvents();
    // Auto-refresh every 5 minutes
    if (refreshTimer)
        clearInterval(refreshTimer);
    refreshTimer = setInterval(() => loadEvents(), REFRESH_INTERVAL_MS);
}
document.addEventListener('DOMContentLoaded', () => init());
