import {
  Tray,
  BrowserWindow,
  nativeImage,
  nativeTheme,
  Menu,
  app,
  screen,
  type Rectangle,
} from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let tray: Tray | null = null;

export function setupTray(win: BrowserWindow): void {
  // In dev:      __dirname = lib/main/   → ../../src/assets
  // In packaged: __dirname = app.asar/lib/main/ → ../../src/assets (inside asar)
  //
  // IMPORTANT: use nativeImage.createFromPath() — it understands asar virtual paths.
  // fs.readFileSync() does NOT resolve asar paths in the main process and will throw,
  // which silently prevents the tray from ever being created.
  const assetsDir = path.join(__dirname, '..', '..', 'src', 'assets');

  function buildIcon(isDark: boolean): Electron.NativeImage {
    const suffix = isDark ? 'dark' : 'light';
    const icon1x = nativeImage.createFromPath(path.join(assetsDir, `tray-icon-${suffix}.png`));
    const icon2x = nativeImage.createFromPath(path.join(assetsDir, `tray-icon-${suffix}@2x.png`));
    const icon = nativeImage.createEmpty();
    icon.addRepresentation({ scaleFactor: 1.0, buffer: icon1x.toPNG() });
    icon.addRepresentation({ scaleFactor: 2.0, buffer: icon2x.toPNG() });
    return icon;
  }

  tray = new Tray(buildIcon(nativeTheme.shouldUseDarkColors));
  tray.setToolTip('Google Meet');

  // Update icon whenever the system theme changes
  const onThemeUpdated = (): void => {
    tray?.setImage(buildIcon(nativeTheme.shouldUseDarkColors));
  };
  nativeTheme.on('updated', onThemeUpdated);

  // Listener is cleaned up on process exit (app.before-quit destroys the tray).

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Google Meet',
      click: () => showWindow(win),
    },
    { type: 'separator' },
    {
      label: 'About',
      click: () => app.showAboutPanel(),
    },
    {
      label: 'Quit',
      accelerator: 'Cmd+Q',
      click: () => app.quit(),
    },
  ]);

  // Left-click → toggle window (show/hide)
  tray.on('click', () => {
    if (win.isVisible()) {
      win.hide();
      app.dock?.hide();
    } else {
      showWindow(win);
    }
  });

  // Right-click → context menu
  tray.on('right-click', () => {
    tray!.popUpContextMenu(contextMenu);
  });
}

/** Max characters to show for the event title portion of the tray label */
const TRAY_TITLE_MAX_CHARS = 12;

/**
 * Update the tray status bar title next to the icon.
 * Pass null or empty string to clear.
 * Pass minsRemaining to append " in X mins" / " in 1 min" countdown suffix.
 */
export function updateTrayTitle(title: string | null, minsRemaining?: number): void {
  if (!tray) return;
  if (!title) {
    tray.setTitle('');
    return;
  }
  const truncated =
    title.length > TRAY_TITLE_MAX_CHARS
      ? title.slice(0, TRAY_TITLE_MAX_CHARS) + '\u2026'
      : title;
  if (minsRemaining !== undefined && minsRemaining > 0) {
    const suffix = minsRemaining === 1 ? ' in 1 min' : ` in ${minsRemaining} mins`;
    tray.setTitle(truncated + suffix);
  } else {
    tray.setTitle(truncated);
  }
}

function showWindow(win: BrowserWindow): void {
  const trayBounds = tray!.getBounds();
  const position = getWindowPosition(win, trayBounds);

  win.setPosition(position.x, position.y, false);
  win.show();
  win.focus();
  app.dock?.hide();
}

function getWindowPosition(
  win: BrowserWindow,
  trayBounds: Rectangle
): { x: number; y: number } {
  const winBounds = win.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: trayBounds.x,
    y: trayBounds.y,
  });
  const workArea = display.workArea;

  // Center horizontally below tray icon
  let x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);
  // Position below the menu bar (tray bottom)
  let y = Math.round(trayBounds.y + trayBounds.height + 4);

  // Clamp to screen bounds
  x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - winBounds.width));
  y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - winBounds.height));

  return { x, y };
}
