import "./styles.css";
import type { AlertPayload } from "../../shared/alert.js";
import { escapeHtml } from "../../shared/utils/escape-html.js";
import { isElementTarget } from "../utils/dom.js";

const TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
};

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
};

let isDismissing = false;
let currentPayload: AlertPayload | null = null;

function dismissAlert(): void {
  if (isDismissing) {
    return;
  }

  isDismissing = true;

  if (currentPayload) {
    window.api.alert.notifyDismissed(currentPayload.id);
  }

  const card = document.querySelector<HTMLElement>(".alert-card");
  if (!card) {
    window.close();
    return;
  }

  let isClosed = false;
  const closeWindow = (): void => {
    if (isClosed) {
      return;
    }
    isClosed = true;
    window.close();
  };

  const fallbackTimer = window.setTimeout(() => {
    closeWindow();
  }, 300);

  card.addEventListener(
    "animationend",
    () => {
      window.clearTimeout(fallbackTimer);
      closeWindow();
    },
    { once: true },
  );

  card.classList.add("alert-dismissing");
}

function formatTimeRange(startISO: string, endISO: string, isAllDay: boolean): string {
  if (isAllDay) {
    return "All day";
  }

  const start = new Date(startISO);
  const end = new Date(endISO);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Time unavailable";
  }

  const startTime = start.toLocaleTimeString([], TIME_OPTIONS);
  const endTime = end.toLocaleTimeString([], TIME_OPTIONS);
  const isSameDay = start.toDateString() === end.toDateString();

  if (isSameDay) {
    return `${startTime} – ${endTime}`;
  }

  const startDate = start.toLocaleDateString([], DATE_OPTIONS);
  const endDate = end.toLocaleDateString([], DATE_OPTIONS);

  return `${startDate}, ${startTime} – ${endDate}, ${endTime}`;
}

function render(data: AlertPayload): void {
  try {
    const app = document.getElementById("app");
    if (!app) return;

    const title = escapeHtml(data.title);
    const calendarName = escapeHtml(data.calendarName);
    const description = escapeHtml(data.description?.trim() ?? "");
    const timeRange = formatTimeRange(data.startDate, data.endDate, data.isAllDay);

    app.innerHTML = `
    <section class="alert-window" role="dialog" aria-live="polite" aria-label="Meeting starting alert">
      <article class="alert-card">
        <p class="alert-badge">Meeting Starting</p>
        <h1 class="alert-title">${title}</h1>

        ${
          description
            ? `<div class="alert-description-wrapper"><div class="alert-description">${description}</div></div>`
            : ""
        }

        <div class="alert-metadata" aria-label="Meeting details">
          <p class="alert-metadata-row">
            <span class="alert-metadata-icon" aria-hidden="true">📅</span>
            <span>${calendarName}</span>
          </p>
          <p class="alert-metadata-row">
            <span class="alert-metadata-icon" aria-hidden="true">🕐</span>
            <span>${timeRange}</span>
          </p>
        </div>

        <div class="alert-actions">
          ${
            data.hasMeetUrl
              ? `<button class="alert-btn alert-btn-join" data-action="join">Join Meeting</button>`
              : ""
          }
          <button class="alert-btn alert-btn-dismiss" data-action="dismiss">Dismiss</button>
        </div>
      </article>
    </section>
  `;
  } catch (error) {
    console.error("[alert] Render error:", error);
    document.body.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#fff;background:#1d1d1f;padding:24px;text-align:center;">Unable to display meeting alert</div>';
  }
}

async function joinFromAlert(): Promise<void> {
  if (!currentPayload?.hasMeetUrl) return;
  const joinBtn = document.querySelector<HTMLButtonElement>('[data-action="join"]');
  if (joinBtn) {
    joinBtn.disabled = true;
    joinBtn.textContent = "Opening…";
  }
  const result = await window.api.app.joinMeeting(currentPayload.id);
  if (!result.ok) {
    console.error("[alert] Join failed:", result.error);
    const errorText =
      typeof result.error === "string" && result.error.length > 0
        ? result.error
        : "Could not open the meeting";
    let banner = document.getElementById("join-error");
    if (!banner) {
      banner = document.createElement("p");
      banner.id = "join-error";
      banner.setAttribute("role", "alert");
      banner.style.cssText =
        "margin:12px 0 0;padding:8px 12px;border-radius:8px;background:rgba(255,69,58,0.18);color:#ffb4ae;font-size:13px;line-height:1.35;";
      const actions = document.querySelector(".alert-actions");
      actions?.parentElement?.insertBefore(banner, actions);
    }
    banner.textContent = errorText.slice(0, 160);
    if (joinBtn) {
      joinBtn.disabled = false;
      joinBtn.textContent = "Join Meeting";
    }
    return;
  }
  dismissAlert();
}

function setupDelegatedEvents(): void {
  const app = document.getElementById("app");
  if (!app) return;

  app.addEventListener("click", (event: MouseEvent) => {
    if (!isElementTarget(event.target)) return;
    const target = event.target.closest<HTMLElement>("[data-action]");

    if (!target) {
      return;
    }

    const action = target.dataset["action"];

    if (action === "dismiss") {
      dismissAlert();
    } else if (action === "join") {
      void joinFromAlert();
    }
  });
}

function setupKeyboardDismiss(): void {
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      dismissAlert();
    }
  });
}

window.api.alert.onShowAlert((data: AlertPayload) => {
  currentPayload = data;
  render(data);
});

document.addEventListener("DOMContentLoaded", () => {
  setupDelegatedEvents();
  setupKeyboardDismiss();
});
