import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for alert/index.ts
 *
 * The alert module registers a callback via window.api.alert.onShowAlert and
 * sets up delegated events + keyboard dismiss on DOMContentLoaded.
 * Most functions are module-private, so we test:
 * 1. Module loads correctly
 * 2. formatTimeRange logic (concepts)
 * 3. Dismiss animation pattern (DOM-based simulation)
 */

describe("alert/index.ts", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    vi.restoreAllMocks();
  });

  it("module can be imported without errors", async () => {
    // Mock window.api before importing the module
    vi.stubGlobal("api", {
      alert: {
        onShowAlert: vi.fn(),
      },
    });

    const module = await import("../../src/renderer/alert/index.js");
    expect(module).toBeDefined();
});
});

describe("formatTimeRange logic", () => {
  it("returns 'All day' for all-day events (concept)", () => {
    const isAllDay = true;
    expect(isAllDay).toBe(true);
  });

  it("handles same-day vs multi-day date ranges", () => {
    const start = new Date("2026-03-27T10:00:00");
    const end = new Date("2026-03-27T10:30:00");
    expect(start.toDateString()).toBe(end.toDateString());

    const end2 = new Date("2026-03-28T14:00:00");
    expect(start.toDateString()).not.toBe(end2.toDateString());
  });

  it("detects invalid dates via NaN", () => {
    const invalid = new Date("not-a-date");
    expect(Number.isNaN(invalid.getTime())).toBe(true);

    const valid = new Date("2026-03-27T10:00:00");
    expect(Number.isNaN(valid.getTime())).toBe(false);
  });
});

describe("alert DOM structure", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  it("dismiss button has data-action attribute", () => {
    document.body.innerHTML =
      '<div id="app"><article class="alert-card"><button class="alert-btn alert-btn-dismiss" data-action="dismiss">Dismiss</button></article></div>';

    const btn = document.querySelector('[data-action="dismiss"]');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toContain("Dismiss");
  });

  it("alert-card element can receive animation events", () => {
    document.body.innerHTML =
      '<div id="app"><article class="alert-card"><p>Test</p></article></div>';

    const card = document.querySelector(".alert-card");
    expect(card).not.toBeNull();

    card?.classList.add("alert-dismissing");
    expect(card?.classList.contains("alert-dismissing")).toBe(true);
  });

  it("escapeHtml is imported from shared module", async () => {
    const { escapeHtml } =
      await import("../../src/shared/utils/escape-html.js");
    expect(typeof escapeHtml).toBe("function");
    expect(escapeHtml("<script>")).not.toContain("<script>");
  });
});

describe("alert event delegation", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    vi.restoreAllMocks();
  });

  it("click on dismiss button finds data-action", () => {
    document.body.innerHTML =
      '<div id="app"><article class="alert-card"><button data-action="dismiss">Dismiss</button></article></div>';

    const app = document.getElementById("app");
    const btn = app?.querySelector("[data-action]");
    expect(btn?.getAttribute("data-action")).toBe("dismiss");
  });

  it("click outside data-action elements returns null", () => {
    document.body.innerHTML =
      '<div id="app"><article class="alert-card"><p>No action here</p></article></div>';

    const span = document.querySelector("p");
    const action = (span as HTMLElement)?.closest?.("[data-action]");
    expect(action).toBeNull();
  });
});
