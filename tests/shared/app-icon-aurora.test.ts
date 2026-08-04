import { describe, it, expect } from "vitest";
import {
  APP_ICON_AURORA_COLORS,
  APP_ICON_AURORA_CSS,
  appIconWithAuroraHtml,
} from "../../src/shared/utils/app-icon-aurora.js";

describe("app-icon-aurora", () => {
  it("exports brand blue matching the about icon", () => {
    expect(APP_ICON_AURORA_COLORS.blue).toBe("#4285F4");
  });

  it("includes multi-blob aurora CSS with reduced-motion fallbacks", () => {
    expect(APP_ICON_AURORA_CSS).toContain(".app-icon-aurora");
    expect(APP_ICON_AURORA_CSS).toContain("app-icon-aurora__blob--core");
    expect(APP_ICON_AURORA_CSS).toContain("@keyframes app-icon-aurora-spin");
    expect(APP_ICON_AURORA_CSS).toContain("prefers-reduced-motion");
    expect(APP_ICON_AURORA_CSS).toContain(APP_ICON_AURORA_COLORS.blue);
  });

  it("builds icon markup with size, class, and escaped src", () => {
    const html = appIconWithAuroraHtml('data:image/svg+xml,<svg>"x</svg>', {
      size: 72,
      className: "app-icon-aurora--settings",
    });
    expect(html).toContain('class="app-icon-aurora app-icon-aurora--settings"');
    expect(html).toContain("--icon-size: 72px");
    expect(html).toContain('width="72"');
    expect(html).toContain("app-icon-aurora__ring");
    expect(html).toContain("aria-hidden");
    expect(html).toContain("&quot;");
    expect(html).not.toContain('src="data:image/svg+xml,<svg>"x</svg>"');
  });

  it("omits aria-hidden when alt is provided", () => {
    const html = appIconWithAuroraHtml("icon.svg", { alt: "GogMeet" });
    expect(html).not.toContain("aria-hidden");
    expect(html).toContain('alt="GogMeet"');
  });
});
