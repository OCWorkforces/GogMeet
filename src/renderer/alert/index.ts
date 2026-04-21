import "./styles.css";
import type { MeetingEvent } from "../../shared/models.js";
import { escapeHtml } from "../../shared/utils/escape-html.js";

type AlertPayload = Pick<MeetingEvent, "title"> &
  Partial<Omit<MeetingEvent, "title">> & {
    meetUrl?: string;
  };

const TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
};

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
};

let isDismissing = false;

function dismissAlert(): void {
  if (isDismissing) {
    return;
  }

  isDismissing = true;

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

function formatTimeRange(
  startISO: string,
  endISO: string,
  isAllDay: boolean,
): string {
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
    const calendarName = escapeHtml(data.calendarName ?? "Unknown calendar");
    const description = escapeHtml(data.description?.trim() ?? "");
    const timeRange = formatTimeRange(
      data.startDate ?? "",
      data.endDate ?? "",
      data.isAllDay ?? false,
    );

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

function setupDelegatedEvents(): void {
  const app = document.getElementById("app");
  if (!app) return;

  app.addEventListener("click", (event: MouseEvent) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-action]",
    );

    if (!target) {
      return;
    }

    const action = target.dataset["action"];


    if (action === "dismiss") {
      dismissAlert();
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
  render(data);
});

document.addEventListener("DOMContentLoaded", () => {
  setupDelegatedEvents();
  setupKeyboardDismiss();
});
