import {
  Tray,
  BrowserWindow,
  nativeImage,
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
  // In dev: __dirname is lib/main/, assets are at ../../src/assets/
  // In packaged: assets are in Resources/app/src/assets/
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app', 'src', 'assets', 'tray-iconTemplate.png')
    : path.join(__dirname, '..', '..', 'src', 'assets', 'tray-iconTemplate.png');

  const icon = nativeImage
    .createFromPath(iconPath)
    .resize({ width: 18, height: 18 });
  icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip('GiMeet');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show GiMeet',
      click: () => showWindow(win),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      accelerator: 'Cmd+Q',
      click: () => app.quit(),
    },
  ]);

  tray.on('click', () => {
    if (win.isVisible()) {
      win.hide();
      app.dock?.hide();
    } else {
      showWindow(win);
    }
  });

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
