import {
  Tray,
  BrowserWindow,
  nativeImage,
  Menu,
  app,
  screen,
  type Rectangle,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let tray: Tray | null = null;

export function setupTray(win: BrowserWindow): void {
  // In dev: __dirname is lib/main/, assets are at ../../src/assets/
  // In packaged: assets are in Resources/app/src/assets/
  const assetsDir = app.isPackaged
    ? path.join(process.resourcesPath, 'app', 'src', 'assets')
    : path.join(__dirname, '..', '..', 'src', 'assets');

  const iconPath = path.join(assetsDir, 'tray-iconTemplate.png');
  const icon2xPath = path.join(assetsDir, 'tray-iconTemplate@2x.png');

  // Build a nativeImage with both 1x and 2x representations so macOS picks
  // the correct resolution on Retina displays. setTemplateImage(true) makes
  // macOS automatically render it black on light menu bars and white on dark.
  const icon = nativeImage.createEmpty();
  icon.addRepresentation({ scaleFactor: 1.0, buffer: fs.readFileSync(iconPath) });
  icon.addRepresentation({ scaleFactor: 2.0, buffer: fs.readFileSync(icon2xPath) });
  icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip('Google Meet');

  // Configure native About panel
  app.setAboutPanelOptions({
    applicationName: 'Google Meet',
    applicationVersion: app.getVersion(),
    version: app.getVersion(),
    credits: 'Developed by CCWorkforce',
    copyright: `© ${new Date().getFullYear()} CCWorkforce`,
    iconPath,
  });

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

  // Left-click → pop up context menu (native macOS tray style)
  tray.on('click', () => {
    tray!.popUpContextMenu(contextMenu);
  });

  // Right-click → same menu
  tray.on('right-click', () => {
    tray!.popUpContextMenu(contextMenu);
  });
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
