import { isElementTarget } from "../utils/dom.js";

export interface DelegatedEventHandlers {
  onForcePoll: () => void;
  onGrantAccess: () => void;
  onJoinMeeting: (eventId: string) => void;
}

export function setupDelegatedEvents(handlers: DelegatedEventHandlers): void {
  const container = document.getElementById("app");
  if (!container) return;

  container.addEventListener("click", (e: MouseEvent) => {
    if (!isElementTarget(e.target)) return;
    const target = e.target.closest<HTMLElement>("[data-action]");
    if (!target) return;

    const action = target.dataset["action"];
    switch (action) {
      case "refresh":
      case "retry":
        handlers.onForcePoll();
        break;
      case "grant-access":
        handlers.onGrantAccess();
        break;
      case "join-meeting": {
        const eventId = target.dataset["eventId"];
        if (eventId) handlers.onJoinMeeting(eventId);
        break;
      }
    }
  });
}
