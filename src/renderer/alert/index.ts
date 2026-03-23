import "./styles.css";
import type { MeetingEvent } from "../../shared/types.js";
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
  const app = document.getElementById("app");
  if (!app) return;

  const title = escapeHtml(data.title);
  const calendarName = escapeHtml(data.calendarName ?? "Unknown calendar");
  const description = data.description?.trim() ?? "";
  const escapedDescription = description ? escapeHtml(description) : "";
  const timeRange = formatTimeRange(
    data.startDate ?? "",
    data.endDate ?? "",
    data.isAllDay ?? false,
  );
  const escapedUrl = data.meetUrl ? escapeHtml(data.meetUrl) : "";

  app.innerHTML = `
    <section class="alert-window" role="dialog" aria-live="polite" aria-label="Meeting starting alert">
      <article class="alert-card">
        <p class="alert-badge">Meeting Starting</p>
        <h1 class="alert-title">${title}</h1>

        ${
          escapedDescription
            ? `<p class="alert-description">${escapedDescription}</p>`
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
            data.meetUrl
              ? `<button class="alert-btn alert-btn-join" data-action="join" data-url="${escapedUrl}">Join Meeting</button>`
              : ""
          }
          <button class="alert-btn alert-btn-dismiss" data-action="dismiss">Dismiss</button>
        </div>
      </article>
    </section>
  `;
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

    if (action === "join") {
      const url = target.dataset["url"];
      if (url) {
        window.api.app.openExternal(url);
      }
      window.close();
      return;
    }

    if (action === "dismiss") {
      window.close();
    }
  });
}

function setupKeyboardDismiss(): void {
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      window.close();
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
