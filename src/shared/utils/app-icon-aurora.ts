/**
 * App-icon aurora — pure CSS + HTML strings for Settings / About dialogs.
 * Colors track the about-icon brand blue (#4285F4) with a soft green accent.
 * No DOM or Electron APIs; safe for main (data: HTML) and renderer templates.
 */

/** Brand palette from `src/assets/about-icon.svg`. */
export const APP_ICON_AURORA_COLORS = {
  blue: "#4285F4",
  blueSoft: "#669DF6",
  blueMist: "#8AB4F8",
  green: "#34A853",
  cyan: "#5AC8FA",
} as const;

export type AppIconAuroraOptions = {
  /** Icon pixel size (width & height). Default 96. */
  size?: number;
  /** Extra class on the outer wrap (e.g. layout modifiers). */
  className?: string;
  /** Accessible label; when omitted the wrap is aria-hidden. */
  alt?: string;
};

/**
 * CSS for `.app-icon-aurora` (multi-blob soft glow + slow drift).
 * Embed in a `<style>` tag (About data: document) or a renderer stylesheet.
 */
export const APP_ICON_AURORA_CSS: string = /* css */ `
.app-icon-aurora {
  --icon-size: 96px;
  --aurora-blue: ${APP_ICON_AURORA_COLORS.blue};
  --aurora-blue-soft: ${APP_ICON_AURORA_COLORS.blueSoft};
  --aurora-blue-mist: ${APP_ICON_AURORA_COLORS.blueMist};
  --aurora-green: ${APP_ICON_AURORA_COLORS.green};
  --aurora-cyan: ${APP_ICON_AURORA_COLORS.cyan};
  position: relative;
  display: grid;
  place-items: center;
  width: var(--icon-size);
  height: var(--icon-size);
  flex-shrink: 0;
  /* Blobs intentionally paint outside the box */
  overflow: visible;
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
}

.app-icon-aurora__stage {
  position: relative;
  display: grid;
  place-items: center;
  width: var(--icon-size);
  height: var(--icon-size);
  overflow: visible;
}

.app-icon-aurora__blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(calc(var(--icon-size) * 0.28));
  opacity: 0.72;
  mix-blend-mode: screen;
  will-change: transform, opacity;
  transform: translate3d(0, 0, 0) scale(1);
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  animation-direction: alternate;
}

.app-icon-aurora__blob--core {
  width: calc(var(--icon-size) * 1.35);
  height: calc(var(--icon-size) * 1.35);
  background: radial-gradient(
    circle at 50% 45%,
    color-mix(in srgb, var(--aurora-blue-mist) 85%, white) 0%,
    color-mix(in srgb, var(--aurora-blue) 70%, transparent) 42%,
    color-mix(in srgb, var(--aurora-blue) 18%, transparent) 68%,
    transparent 78%
  );
  filter: blur(calc(var(--icon-size) * 0.18));
  opacity: 0.9;
  animation-name: app-icon-aurora-breathe;
  animation-duration: 5.5s;
}

.app-icon-aurora__blob--a {
  width: calc(var(--icon-size) * 1.55);
  height: calc(var(--icon-size) * 1.2);
  background: radial-gradient(
    ellipse at 40% 50%,
    color-mix(in srgb, var(--aurora-blue) 90%, transparent) 0%,
    color-mix(in srgb, var(--aurora-cyan) 45%, transparent) 45%,
    transparent 72%
  );
  top: 50%;
  left: 50%;
  margin-top: calc(var(--icon-size) * -0.6);
  margin-left: calc(var(--icon-size) * -0.78);
  animation-name: app-icon-aurora-drift-a;
  animation-duration: 7.2s;
}

.app-icon-aurora__blob--b {
  width: calc(var(--icon-size) * 1.25);
  height: calc(var(--icon-size) * 1.45);
  background: radial-gradient(
    ellipse at 55% 40%,
    color-mix(in srgb, var(--aurora-blue-soft) 80%, transparent) 0%,
    color-mix(in srgb, var(--aurora-green) 28%, transparent) 50%,
    transparent 74%
  );
  top: 50%;
  left: 50%;
  margin-top: calc(var(--icon-size) * -0.72);
  margin-left: calc(var(--icon-size) * -0.55);
  opacity: 0.55;
  animation-name: app-icon-aurora-drift-b;
  animation-duration: 8.6s;
  animation-delay: -1.2s;
}

.app-icon-aurora__blob--c {
  width: calc(var(--icon-size) * 1.1);
  height: calc(var(--icon-size) * 1.1);
  background: radial-gradient(
    circle at 50% 50%,
    color-mix(in srgb, var(--aurora-cyan) 70%, white) 0%,
    color-mix(in srgb, var(--aurora-blue) 35%, transparent) 48%,
    transparent 70%
  );
  top: 50%;
  left: 50%;
  margin-top: calc(var(--icon-size) * -0.55);
  margin-left: calc(var(--icon-size) * -0.55);
  opacity: 0.45;
  filter: blur(calc(var(--icon-size) * 0.22));
  animation-name: app-icon-aurora-drift-c;
  animation-duration: 6.4s;
  animation-delay: -2.4s;
}

.app-icon-aurora__ring {
  position: absolute;
  width: calc(var(--icon-size) * 1.22);
  height: calc(var(--icon-size) * 1.22);
  border-radius: 50%;
  background: conic-gradient(
    from 180deg,
    transparent 0deg,
    color-mix(in srgb, var(--aurora-blue) 35%, transparent) 70deg,
    color-mix(in srgb, var(--aurora-cyan) 40%, transparent) 140deg,
    color-mix(in srgb, var(--aurora-green) 22%, transparent) 210deg,
    color-mix(in srgb, var(--aurora-blue-soft) 38%, transparent) 290deg,
    transparent 360deg
  );
  filter: blur(calc(var(--icon-size) * 0.12));
  opacity: 0.55;
  mix-blend-mode: screen;
  animation: app-icon-aurora-spin 14s linear infinite;
  will-change: transform;
}

.app-icon-aurora__icon {
  position: relative;
  z-index: 1;
  display: block;
  width: var(--icon-size);
  height: var(--icon-size);
  border-radius: 22%;
  box-shadow:
    0 10px 32px rgba(0, 0, 0, 0.45),
    0 2px 8px rgba(0, 0, 0, 0.35),
    0 0 0 0.5px color-mix(in srgb, var(--aurora-blue) 22%, transparent);
  pointer-events: none;
}

@keyframes app-icon-aurora-breathe {
  from { transform: scale(0.92); opacity: 0.75; }
  to { transform: scale(1.08); opacity: 1; }
}

@keyframes app-icon-aurora-drift-a {
  from { transform: translate3d(-6%, 4%, 0) rotate(-8deg) scale(0.95); }
  to { transform: translate3d(8%, -6%, 0) rotate(10deg) scale(1.08); }
}

@keyframes app-icon-aurora-drift-b {
  from { transform: translate3d(7%, -5%, 0) rotate(6deg) scale(1.05); }
  to { transform: translate3d(-9%, 7%, 0) rotate(-12deg) scale(0.92); }
}

@keyframes app-icon-aurora-drift-c {
  from { transform: translate3d(-4%, -7%, 0) scale(0.9); opacity: 0.35; }
  to { transform: translate3d(5%, 5%, 0) scale(1.12); opacity: 0.6; }
}

@keyframes app-icon-aurora-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .app-icon-aurora__blob,
  .app-icon-aurora__ring {
    animation: none !important;
    will-change: auto;
  }
  .app-icon-aurora__blob--core {
    opacity: 0.85;
    transform: none;
  }
  .app-icon-aurora__blob--a,
  .app-icon-aurora__blob--b,
  .app-icon-aurora__blob--c {
    opacity: 0.4;
    transform: none;
  }
  .app-icon-aurora__ring {
    opacity: 0.35;
    transform: none;
  }
}

@media (prefers-reduced-transparency: reduce) {
  .app-icon-aurora__blob,
  .app-icon-aurora__ring {
    opacity: 0.28;
    filter: blur(calc(var(--icon-size) * 0.14));
    mix-blend-mode: normal;
  }
  .app-icon-aurora__blob--core {
    opacity: 0.4;
  }
}

@media (prefers-contrast: more) {
  .app-icon-aurora__blob,
  .app-icon-aurora__ring {
    opacity: 0.2;
  }
  .app-icon-aurora__icon {
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.55),
      0 0 0 1px color-mix(in srgb, var(--aurora-blue) 45%, white);
  }
}
`.trim();

/**
 * Escape a value for use inside a double-quoted HTML attribute.
 * Minimal: only the characters that can break out of `attr="..."`.
 */
function escapeAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

/**
 * Build the aurora stage + icon markup.
 * @param iconSrc Trusted image URL or data: URI for the app icon.
 */
export function appIconWithAuroraHtml(iconSrc: string, options: AppIconAuroraOptions = {}): string {
  const size = options.size ?? 96;
  const sizePx = `${size}px`;
  const extraClass = options.className ? ` ${options.className}` : "";
  const hasAlt = options.alt !== undefined && options.alt.length > 0;
  const aria = hasAlt ? "" : ' aria-hidden="true"';
  const altAttr = hasAlt ? escapeAttr(options.alt!) : "";
  const src = escapeAttr(iconSrc);

  return `<div class="app-icon-aurora${extraClass}" style="--icon-size: ${sizePx}"${aria}>
  <div class="app-icon-aurora__stage">
    <span class="app-icon-aurora__blob app-icon-aurora__blob--core"></span>
    <span class="app-icon-aurora__blob app-icon-aurora__blob--a"></span>
    <span class="app-icon-aurora__blob app-icon-aurora__blob--b"></span>
    <span class="app-icon-aurora__blob app-icon-aurora__blob--c"></span>
    <span class="app-icon-aurora__ring"></span>
    <img class="app-icon-aurora__icon" src="${src}" width="${size}" height="${size}" alt="${altAttr}" draggable="false" />
  </div>
</div>`;
}
