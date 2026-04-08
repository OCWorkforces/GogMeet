export interface DelegatedEventHandlers {
  onLoadEvents: () => void;
  onGrantAccess: () => void;
  onOpenExternal: (url: string) => void;
}

export function setupDelegatedEvents(handlers: DelegatedEventHandlers): void {
  const container = document.getElementById("app");
  if (!container) return;

  container.addEventListener("click", (e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(
      "[data-action]",
    );
    if (!target) return;

    const action = target.dataset["action"];
    switch (action) {
      case "refresh":
      case "retry":
        handlers.onLoadEvents();
        break;
      case "grant-access":
        handlers.onGrantAccess();
        break;
      case "join-meeting": {
        const url = target.dataset["url"];
        if (url) handlers.onOpenExternal(url);
        break;
      }
    }
  });
}
