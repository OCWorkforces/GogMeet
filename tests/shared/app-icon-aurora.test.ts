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
    expect(APP_ICON_AURORA_CSS).toContain("@keyframes app-icon-aurora-bloom-in");
    expect(APP_ICON_AURORA_CSS).toContain("app-icon-aurora--about");
    expect(APP_ICON_AURORA_CSS).toContain("app-icon-aurora__ring--counter");
    expect(APP_ICON_AURORA_CSS).toContain("app-icon-aurora__sheen");
    expect(APP_ICON_AURORA_CSS).toContain("app-icon-aurora__flare");
    expect(APP_ICON_AURORA_CSS).toContain("prefers-reduced-motion");
    expect(APP_ICON_AURORA_CSS).toContain(APP_ICON_AURORA_COLORS.blue);
    expect(APP_ICON_AURORA_CSS).toContain("cubic-bezier(0.23, 1, 0.32, 1)");
    expect(APP_ICON_AURORA_CSS).toContain("app-icon-aurora-breathe-fancy");
    expect(APP_ICON_AURORA_CSS).toContain("app-icon-aurora-drift-a-fancy");
    // Calmer base for Settings; fancy ring only under --about
    expect(APP_ICON_AURORA_CSS).toContain("animation-duration: 5.5s");
    expect(APP_ICON_AURORA_CSS).toContain("animation-play-state: paused");
    // --about specificity must win inside preference media queries
    expect(APP_ICON_AURORA_CSS).toContain(
      ".app-icon-aurora--about .app-icon-aurora__sheen",
    );
    expect(APP_ICON_AURORA_CSS).toMatch(
      /prefers-reduced-transparency: reduce[\s\S]*app-icon-aurora--about \.app-icon-aurora__sheen/,
    );
    expect(APP_ICON_AURORA_CSS).toMatch(
      /prefers-contrast: more[\s\S]*app-icon-aurora--about \.app-icon-aurora__flare/,
    );
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
    expect(html).toContain("app-icon-aurora__ring--counter");
    expect(html).toContain("app-icon-aurora__sheen");
    expect(html).toContain("app-icon-aurora__flare");
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
