import "./styles.css";
import type { AppSettings } from "../../shared/types.js";
import {
  OPEN_BEFORE_MINUTES_MIN,
  OPEN_BEFORE_MINUTES_MAX,
} from "../../shared/types.js";

let settings: AppSettings = {
  openBeforeMinutes: 1,
  launchAtLogin: false,
  showTomorrowMeetings: true,
};
let isSaving = false;
let saveIndicatorTimer: ReturnType<typeof setTimeout> | null = null;

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
          <span class="save-indicator" id="save-indicator"></span>
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
          <span class="save-indicator" id="launch-save-indicator"></span>
          <label class="toggle-switch">
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
          <span class="save-indicator" id="tomorrow-save-indicator"></span>
          <label class="toggle-switch">
            <input type="checkbox" id="show-tomorrow-toggle" class="toggle-input"${settings.showTomorrowMeetings ? " checked" : ""} />
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
  setupToggleListener();
  setupTomorrowToggleListener();
}

function showSaveIndicator(id: string, text: string): void {
  const indicator = document.getElementById(id);
  if (!indicator) return;

  if (saveIndicatorTimer !== null) {
    clearTimeout(saveIndicatorTimer);
    saveIndicatorTimer = null;
  }

  indicator.textContent = text;
  indicator.classList.add("visible");

  saveIndicatorTimer = setTimeout(() => {
    indicator.classList.remove("visible");
    saveIndicatorTimer = null;
  }, 1500);
}

function setupSelectListener(): void {
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

function setupToggleListener(): void {
  const toggle = document.getElementById(
    "launch-at-login-toggle",
  ) as HTMLInputElement | null;
  if (!toggle) return;

  toggle.addEventListener("change", () => {
    void saveSettings(
      { launchAtLogin: toggle.checked },
      "launch-save-indicator",
    );
  });
}

function setupTomorrowToggleListener(): void {
  const toggle = document.getElementById(
    "show-tomorrow-toggle",
  ) as HTMLInputElement | null;
  if (!toggle) return;

  toggle.addEventListener("change", () => {
    void saveSettings(
      { showTomorrowMeetings: toggle.checked },
      "tomorrow-save-indicator",
    );
  });
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
    showSaveIndicator(indicatorId, "✓ Saved");
    // Re-render to sync state without losing focus feel
    render();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save settings";
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
