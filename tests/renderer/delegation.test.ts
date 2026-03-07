import { describe, it, expect, vi } from "vitest";

describe("event delegation", () => {
  it('clicking [data-action="refresh"] is caught by delegated listener on #app', () => {
    document.body.innerHTML =
      '<div id="app"><button data-action="refresh">Refresh</button></div>';
    const app = document.getElementById("app")!;
    const handler = vi.fn();
    app.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-action]",
      );
      if (target?.dataset["action"] === "refresh") handler();
    });
    document
      .querySelector<HTMLButtonElement>('[data-action="refresh"]')!
      .click();
    expect(handler).toHaveBeenCalledOnce();
  });

  it('clicking [data-action="join-meeting"] provides data-url to handler', () => {
    document.body.innerHTML =
      '<div id="app"><button data-action="join-meeting" data-url="https://meet.google.com/abc">Join</button></div>';
    const app = document.getElementById("app")!;
    let capturedUrl = "";
    app.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-action]",
      );
      if (target?.dataset["action"] === "join-meeting") {
        capturedUrl = target.dataset["url"] ?? "";
      }
    });
    document
      .querySelector<HTMLButtonElement>('[data-action="join-meeting"]')!
      .click();
    expect(capturedUrl).toBe("https://meet.google.com/abc");
  });

  it("clicking outside [data-action] elements does not trigger handlers", () => {
    document.body.innerHTML =
      '<div id="app"><span class="no-action">text</span></div>';
    const app = document.getElementById("app")!;
    const handler = vi.fn();
    app.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-action]",
      );
      if (target) handler();
    });
    document.querySelector<HTMLSpanElement>(".no-action")!.click();
    expect(handler).not.toHaveBeenCalled();
  });

  it("only one listener needed regardless of render count", () => {
    // Simulate multiple renders by replacing innerHTML multiple times
    document.body.innerHTML = '<div id="app"></div>';
    const app = document.getElementById("app")!;
    const clickCounts: number[] = [];
    // Setup ONE delegated listener
    app.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-action]",
      );
      if (target?.dataset["action"] === "refresh") clickCounts.push(1);
    });
    // Simulate 3 renders (replacing innerHTML)
    for (let i = 0; i < 3; i++) {
      app.innerHTML = '<button data-action="refresh">Refresh</button>';
    }
    // One click should only trigger handler once
    document
      .querySelector<HTMLButtonElement>('[data-action="refresh"]')!
      .click();
    expect(clickCounts).toHaveLength(1);
  });
});
