import "./styles.css";
import type { AppSettings } from "../../shared/settings.js";
import {
  DEFAULT_SETTINGS,
  OPEN_BEFORE_MINUTES_MIN,
  OPEN_BEFORE_MINUTES_MAX,
} from "../../shared/settings.js";

let settings: AppSettings = { ...DEFAULT_SETTINGS };
let isSaving = false;
let saveIndicatorTimers = new Map<string, ReturnType<typeof setTimeout>>();

function render(errorMessage?: string): void {
  const app = document.getElementById("app");
  if (!app) return;

  const options = Array.from(
    { length: OPEN_BEFORE_MINUTES_MAX - OPEN_BEFORE_MINUTES_MIN + 1 },
    (_, i) => {
      const val = OPEN_BEFORE_MINUTES_MIN + i;
      const selected = val === settings.openBeforeMinutes ? " selected" : "";
      const label = val === 1 ? "1 minute" : `${val} minutes`;
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
        <div class="settings-hero-desc">Google Meet calendar reminders</div>
      </div>
    </div>
    <div class="settings-content">
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
          <span class="setting-description">Display tomorrow's meetings in the popover</span>
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
          <label class="setting-label" for="window-alert-toggle">
            🔔 Show Window Alert
          </label>
          <span class="setting-description">Show a notification window when a meeting starts</span>
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
    </div>
    <div class="settings-footer">
      <span class="settings-footer-text">GogMeet &middot; &copy; ${new Date().getFullYear()}</span>
    </div>
  `;

  setupSelectListener();
  setupToggleListener("launch-at-login-toggle", "launchAtLogin", "launch-save-indicator");
  setupToggleListener("show-tomorrow-toggle", "showTomorrowMeetings", "tomorrow-save-indicator");
  setupToggleListener("window-alert-toggle", "windowAlert", "alert-save-indicator");
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
  // DOM cast: getElementById returns HTMLElement | null; narrow to specific subtype is standard DOM practice
  const select = document.getElementById(
    "open-before-select",
  ) as HTMLSelectElement | null;
  if (!select) return;

  select.addEventListener("change", () => {
    const value = parseInt(select.value, 10);
    if (
      isNaN(value) ||
      value < OPEN_BEFORE_MINUTES_MIN ||
      value > OPEN_BEFORE_MINUTES_MAX
    ) {
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
  // DOM cast: getElementById returns HTMLElement | null; narrow to specific subtype is standard DOM practice
  const toggle = document.getElementById(toggleId) as HTMLInputElement | null;
  if (!toggle) return;

  toggle.addEventListener("change", () => {
    const previous = settings[settingKey];
    const next = toggle.checked;
    void saveToggleSetting(
      toggle,
      settingKey,
      next,
      previous,
      indicatorId,
    );
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
    await saveSettings({ [settingKey]: next } as Partial<AppSettings>, indicatorId);
    if (settings[settingKey] !== next) {
      revertToggle(toggle, previous);
    }
  } catch {
    revertToggle(toggle, previous);
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
    const message =
      err instanceof Error ? err.message : "Failed to save settings";
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
  render();
}

document.addEventListener("DOMContentLoaded", () => {
  void init();
});
