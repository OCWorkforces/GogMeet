import "./styles.css";

interface AlertData {
  title: string;
  meetUrl: string;
}

function render(data: AlertData): void {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = `
    <div class="alert-badge">Meeting Starting</div>
    <div class="alert-title">${data.title}</div>
    <div class="alert-actions">
      ${
        data.meetUrl
          ? `<button class="btn-join-alert" id="btn-join" data-url="${data.meetUrl}">Join Meeting</button>`
          : ""
      }
      <button class="btn-dismiss" id="btn-dismiss">Dismiss</button>
    </div>
  `;

  const joinBtn = document.getElementById("btn-join");
  if (joinBtn) {
    joinBtn.addEventListener("click", () => {
      const url = joinBtn.getAttribute("data-url");
      if (url) window.api.app.openExternal(url);
      window.close();
    });
  }

  document.getElementById("btn-dismiss")?.addEventListener("click", () => {
    window.close();
  });

  // Escape key dismisses
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      window.close();
    }
  });
}

window.api.alert.onShowAlert((data: AlertData) => {
  render(data);
});
