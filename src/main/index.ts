import { app, BrowserWindow, shell, nativeImage, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupTray } from './tray.js';
import { registerIpcHandlers } from './ipc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 360,
    height: 480,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    vibrancy: 'popover',
    visualEffectState: 'active',
    titleBarStyle: 'hidden',
    transparent: true,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    const devUrl = process.env['VITE_DEV_SERVER_URL'] ?? 'http://localhost:5173';
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  // Intercept close/minimize → hide to tray
  win.on('close', (event) => {
    event.preventDefault();
    win.hide();
    app.dock?.hide();
  });

  win.on('minimize', () => {
    win.hide();
    app.dock?.hide();
  });

  // Hide when focus lost (popover behavior)
  win.on('blur', () => {
    if (!isDev) {
      win.hide();
      app.dock?.hide();
    }
  });

  return win;
}

app.whenReady().then(() => {
  // Hide from Dock immediately
  app.dock?.hide();

  mainWindow = createWindow();
  registerIpcHandlers(mainWindow);
  setupTray(mainWindow);
});

app.on('window-all-closed', () => {
  // Prevent default quit — tray-only app stays alive
  // No-op: keep app running in tray
});

app.on('before-quit', () => {
  // Allow quit from tray menu
  if (mainWindow) {
    mainWindow.removeListener('close', () => {});
    mainWindow.destroy();
  }
});

export { mainWindow, __dirname, shell, nativeImage, screen };
