import "./styles.css";
import type { AppSettings } from "../../domain/entities/settings.js";
import type { CalendarUiState } from "../../domain/entities/calendar-ui-state.js";
import { defaultCalendarUiState } from "../../domain/entities/calendar-ui-state.js";
import {
  DEFAULT_SETTINGS,
  OPEN_BEFORE_MINUTES_MIN,
  OPEN_BEFORE_MINUTES_MAX,
} from "../../domain/entities/settings.js";
import { queryRequiredElement } from "../utils/dom.js";
import { escapeHtml } from "../../shared/utils/escape-html.js";

let settings: AppSettings = { ...DEFAULT_SETTINGS };
let calendarUi: CalendarUiState = defaultCalendarUiState();
let isSaving = false;
let isCalendarBusy = false;
let saveIndicatorTimers = new Map<string, ReturnType<typeof setTimeout>>();

function calendarAccountSectionHtml(): string {
  const connected = calendarUi.permission === "granted";
  const email = calendarUi.accountEmail ? escapeHtml(calendarUi.accountEmail) : "Google Calendar";
  const statusLine = connected
    ? `Connected as ${email}`
    : calendarUi.oauthConfigured
      ? "Not connected — required on Windows for meeting reminders"
      : "OAuth client ID not configured (GOOGLE_OAUTH_CLIENT_ID)";
  const actionLabel = connected
    ? "Disconnect"
    : calendarUi.permission === "denied"
      ? "Reconnect Google Calendar"
      : "Connect Google Calendar";
  const actionId = connected ? "calendar-disconnect-btn" : "calendar-connect-btn";
  const disabled = isCalendarBusy || (!connected && !calendarUi.oauthConfigured) ? " disabled" : "";

  return `
      <div class="settings-section-heading">Google Calendar</div>
      <div class="setting-row">
        <div class="setting-row-inner">
          <label class="setting-label">📅 Account</label>
          <span class="setting-description">${statusLine}</span>
        </div>
        <div class="setting-control">
          <button type="button" class="setting-button" id="${actionId}"${disabled}>
            ${isCalendarBusy ? "Working…" : actionLabel}
          </button>
        </div>
      </div>
      ${
        calendarUi.lastError
          ? `<p class="settings-error">${escapeHtml(calendarUi.lastError)}</p>`
          : ""
      }
  `;
}

function render(errorMessage?: string): void {
  const app = document.getElementById("app");
  if (!app) return;

  const options = Array.from(
    { length: OPEN_BEFORE_MINUTES_MAX - OPEN_BEFORE_MINUTES_MIN + 1 },
    (_, i) => {
      const val = OPEN_BEFORE_MINUTES_MIN + i;
      const selected = val === settings.openBeforeMinutes ? " selected" : "";
      const label = val === 0 ? "At start" : val === 1 ? "1 minute" : `${val} minutes`;
      return `<option value="${val}"${selected}>${label}</option>`;
    },
  ).join("");

  app.innerHTML = `
    <div class="settings-titlebar">
      <span class="settings-title">Settings</span>
    </div>
    <div class="settings-hero">
      <div class="settings-hero-icon">🎥</div>
      <div class="settings-hero-text">
        <div class="settings-hero-name">GogMeet</div>
        <div class="settings-hero-desc">Calendar meeting reminders</div>
      </div>
    </div>
    <div class="settings-content">
      ${calendarAccountSectionHtml()}
      <div class="settings-section-heading">Meeting Preferences</div>
      <div class="setting-row">
        <div class="setting-row-inner">
          <label class="setting-label" for="open-before-select">
            ⏰ Open browser before meeting
          </label>
          <span class="setting-description">Automatically open meeting links before they start</span>
        </div>
        <div class="setting-control">
          <span class="save-indicator" id="save-indicator" aria-live="polite"></span>
          <select class="setting-select" id="open-before-select">
            ${options}
          </select>
        </div>
      </div>
      ${errorMessage ? `<p class="settings-error">${errorMessage}</p>` : ""}
      <div class="setting-row setting-row--toggle">
        <div class="setting-row-inner">
          <label class="setting-label" for="launch-at-login-toggle">
            🚀 Launch at Login
          </label>
          <span class="setting-description">Automatically start GogMeet when you log in</span>
        </div>
        <div class="setting-control">
          <span class="save-indicator" id="launch-save-indicator" aria-live="polite"></span>
          <label class="toggle-switch" role="switch" aria-checked="${settings.launchAtLogin ? "true" : "false"}">
            <input type="checkbox" id="launch-at-login-toggle" class="toggle-input"${settings.launchAtLogin ? " checked" : ""} />
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
          </label>
        </div>
      </div>
      <div class="setting-row setting-row--toggle">
        <div class="setting-row-inner">
          <label class="setting-label" for="show-tomorrow-toggle">
            📅 Show Tomorrow's Meetings
          </label>
          <span class="setting-description">Display tomorrow's meetings in the tray menu</span>
        </div>
        <div class="setting-control">
          <span class="save-indicator" id="tomorrow-save-indicator" aria-live="polite"></span>
          <label class="toggle-switch" role="switch" aria-checked="${settings.showTomorrowMeetings ? "true" : "false"}">
            <input type="checkbox" id="show-tomorrow-toggle" class="toggle-input"${settings.showTomorrowMeetings ? " checked" : ""} />
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
          </label>
        </div>
      </div>
      <div class="setting-row setting-row--toggle">
        <div class="setting-row-inner">
          <label class="setting-label" for="show-completed-meetings-toggle">
            ✅ Show completed meetings
          </label>
          <span class="setting-description">Show today's finished meetings as muted history in the popover</span>
        </div>
        <div class="setting-control">
          <span class="save-indicator" id="completed-save-indicator" aria-live="polite"></span>
          <label class="toggle-switch" role="switch" aria-checked="${settings.showCompletedTodayMeetings ? "true" : "false"}">
            <input type="checkbox" id="show-completed-meetings-toggle" class="toggle-input"${settings.showCompletedTodayMeetings ? " checked" : ""} />
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
          </label>
        </div>
      </div>
      <div class="setting-row setting-row--toggle">
        <div class="setting-row-inner">
          <label class="setting-label" for="window-alert-toggle">
            🔔 Show Window Alert
          </label>
          <span class="setting-description">Show a full-screen alert before auto-open (lead time below)</span>
        </div>
        <div class="setting-control">
          <span class="save-indicator" id="alert-save-indicator" aria-live="polite"></span>
          <label class="toggle-switch" role="switch" aria-checked="${settings.windowAlert ? "true" : "false"}">
            <input type="checkbox" id="window-alert-toggle" class="toggle-input"${settings.windowAlert ? " checked" : ""} />
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
          </label>
        </div>
      </div>
      <div class="setting-row setting-row--toggle">
        <div class="setting-row-inner">
          <label class="setting-label" for="auto-open-toggle">
            🌐 Auto-Open Browser
          </label>
          <span class="setting-description">Automatically open meeting links before they start</span>
        </div>
        <div class="setting-control">
          <span class="save-indicator" id="auto-open-save-indicator" aria-live="polite"></span>
          <label class="toggle-switch" role="switch" aria-checked="${settings.autoOpenEnabled ? "true" : "false"}">
            <input type="checkbox" id="auto-open-toggle" class="toggle-input"${settings.autoOpenEnabled ? " checked" : ""} />
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
          </label>
        </div>
      </div>
      <div class="setting-row setting-row--toggle">
        <div class="setting-row-inner">
          <label class="setting-label" for="native-notif-toggle">
            📣 OS Notifications
          </label>
          <span class="setting-description">Show a system notification when a meeting auto-opens</span>
        </div>
        <div class="setting-control">
          <span class="save-indicator" id="native-notif-save-indicator" aria-live="polite"></span>
          <label class="toggle-switch" role="switch" aria-checked="${settings.nativeNotifications ? "true" : "false"}">
            <input type="checkbox" id="native-notif-toggle" class="toggle-input"${settings.nativeNotifications ? " checked" : ""} />
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
          </label>
        </div>
      </div>
      <div class="setting-row setting-row--toggle">
        <div class="setting-row-inner">
          <label class="setting-label" for="quiet-hours-toggle">
            🌙 Quiet Hours
          </label>
          <span class="setting-description">Hide alerts and notifications during quiet hours (auto-open continues)</span>
        </div>
        <div class="setting-control">
          <span class="save-indicator" id="quiet-hours-save-indicator" aria-live="polite"></span>
          <label class="toggle-switch" role="switch" aria-checked="${settings.quietHoursEnabled ? "true" : "false"}">
            <input type="checkbox" id="quiet-hours-toggle" class="toggle-input"${settings.quietHoursEnabled ? " checked" : ""} />
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
          </label>
        </div>
      </div>
    </div>
    <div class="settings-footer">
      <span class="settings-footer-text">GogMeet &middot; &copy; ${new Date().getFullYear()}</span>
    </div>
  `;

  setupSelectListener();
  setupToggleListener("launch-at-login-toggle", "launchAtLogin", "launch-save-indicator");
  setupToggleListener("show-tomorrow-toggle", "showTomorrowMeetings", "tomorrow-save-indicator");
  setupToggleListener(
    "show-completed-meetings-toggle",
    "showCompletedTodayMeetings",
    "completed-save-indicator",
  );
  setupToggleListener("window-alert-toggle", "windowAlert", "alert-save-indicator");
  setupToggleListener("auto-open-toggle", "autoOpenEnabled", "auto-open-save-indicator");
  setupToggleListener("native-notif-toggle", "nativeNotifications", "native-notif-save-indicator");
  setupToggleListener("quiet-hours-toggle", "quietHoursEnabled", "quiet-hours-save-indicator");
  setupCalendarAccountListeners();
}

function setupCalendarAccountListeners(): void {
  const connectBtn = document.getElementById("calendar-connect-btn");
  const disconnectBtn = document.getElementById("calendar-disconnect-btn");

  connectBtn?.addEventListener("click", () => {
    void (async () => {
      if (isCalendarBusy) return;
      isCalendarBusy = true;
      render();
      try {
        await window.api.calendar.requestPermission();
        calendarUi = await window.api.calendar.getUiState();
      } catch {
        // keep previous state
      } finally {
        isCalendarBusy = false;
        render();
      }
    })();
  });

  disconnectBtn?.addEventListener("click", () => {
    void (async () => {
      if (isCalendarBusy) return;
      isCalendarBusy = true;
      render();
      try {
        await window.api.calendar.disconnect();
        calendarUi = await window.api.calendar.getUiState();
      } catch {
        // keep previous state
      } finally {
        isCalendarBusy = false;
        render();
      }
    })();
  });
}

function showSaveIndicator(id: string, text: string): void {
  const indicator = document.getElementById(id);
  if (!indicator) return;

  // Clear existing timer for this specific indicator
  const existingTimer = saveIndicatorTimers.get(id);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  indicator.textContent = text;
  indicator.classList.add("visible");

  const timer = setTimeout(() => {
    indicator.classList.remove("visible");
    saveIndicatorTimers.delete(id);
  }, 1500);
  saveIndicatorTimers.set(id, timer);
}

function clearSaveIndicatorTimers(): void {
  for (const timer of saveIndicatorTimers.values()) {
    clearTimeout(timer);
  }
  saveIndicatorTimers.clear();
}

function setupSelectListener(): void {
  const select = queryRequiredElement("open-before-select", HTMLSelectElement);
  if (!select) return;

  select.addEventListener("change", () => {
    const value = parseInt(select.value, 10);
    if (isNaN(value) || value < OPEN_BEFORE_MINUTES_MIN || value > OPEN_BEFORE_MINUTES_MAX) {
      return;
    }
    void saveSettings({ openBeforeMinutes: value }, "save-indicator");
  });
}

type ToggleSettingKey = {
  [K in keyof AppSettings]: AppSettings[K] extends boolean ? K : never;
}[keyof AppSettings];

function setupToggleListener(
  toggleId: string,
  settingKey: ToggleSettingKey,
  indicatorId: string,
): void {
  const toggle = queryRequiredElement(toggleId, HTMLInputElement);
  if (!toggle) return;

  toggle.addEventListener("change", () => {
    const previous = settings[settingKey];
    const next = toggle.checked;
    void saveToggleSetting(toggle, settingKey, next, previous, indicatorId);
  });
}

async function saveToggleSetting(
  toggle: HTMLInputElement,
  settingKey: ToggleSettingKey,
  next: boolean,
  previous: boolean,
  indicatorId: string,
): Promise<void> {
  try {
    await saveSettings(buildTogglePatch(settingKey, next), indicatorId);
    if (settings[settingKey] !== next) {
      revertToggle(toggle, previous);
    }
  } catch {
    revertToggle(toggle, previous);
  }
}

function buildTogglePatch(key: ToggleSettingKey, value: boolean): Partial<AppSettings> {
  switch (key) {
    case "launchAtLogin":
      return { launchAtLogin: value };
    case "showTomorrowMeetings":
      return { showTomorrowMeetings: value };
    case "showCompletedTodayMeetings":
      return { showCompletedTodayMeetings: value };
    case "windowAlert":
      return { windowAlert: value };
    case "autoOpenEnabled":
      return { autoOpenEnabled: value };
    case "nativeNotifications":
      return { nativeNotifications: value };
    case "quietHoursEnabled":
      return { quietHoursEnabled: value };
  }
}

function revertToggle(toggle: HTMLInputElement, previous: boolean): void {
  toggle.checked = previous;
  const wrapper = toggle.closest(".toggle-switch");
  if (wrapper) {
    wrapper.setAttribute("aria-checked", previous ? "true" : "false");
  }
}

async function saveSettings(
  partial: Partial<AppSettings>,
  indicatorId: string = "save-indicator",
): Promise<void> {
  if (isSaving) return;
  isSaving = true;

  try {
    const updated = await window.api.settings.set(partial);
    settings = updated;

    // Only re-render for dropdown changes — toggles already reflect visual state
    // and a full re-render would cut short the CSS slide animation
    if (partial.openBeforeMinutes !== undefined) {
      clearSaveIndicatorTimers();
      render();
    }

    showSaveIndicator(indicatorId, "✓ Saved");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save settings";
    clearSaveIndicatorTimers();
    render(message);
  } finally {
    isSaving = false;
  }
}

async function init(): Promise<void> {
  try {
    settings = await window.api.settings.get();
  } catch {
    // Use default if load fails; render will show no error
  }
  try {
    calendarUi = await window.api.calendar.getUiState();
  } catch {
    calendarUi = defaultCalendarUiState();
  }
  render();
}

document.addEventListener("DOMContentLoaded", () => {
  void init();
});
