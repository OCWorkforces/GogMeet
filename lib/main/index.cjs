"use strict";
const __rslib_import_meta_url__ = /*#__PURE__*/ function() {
    return "u" < typeof document ? new (require('url'.replace('', ''))).URL('file:' + __filename).href : document.currentScript && document.currentScript.src || new URL('main.js', document.baseURI).href;
}();
var __webpack_require__ = {};
(()=>{
    __webpack_require__.n = (module)=>{
        var getter = module && module.__esModule ? ()=>module['default'] : ()=>module;
        __webpack_require__.d(getter, {
            a: getter
        });
        return getter;
    };
})();
(()=>{
    __webpack_require__.d = (exports1, definition)=>{
        for(var key in definition)if (__webpack_require__.o(definition, key) && !__webpack_require__.o(exports1, key)) Object.defineProperty(exports1, key, {
            enumerable: true,
            get: definition[key]
        });
    };
})();
(()=>{
    __webpack_require__.o = (obj, prop)=>Object.prototype.hasOwnProperty.call(obj, prop);
})();
var __webpack_exports__ = {};
const external_electron_namespaceObject = require("electron");
const external_node_path_namespaceObject = require("node:path");
var external_node_path_default = /*#__PURE__*/ __webpack_require__.n(external_node_path_namespaceObject);
const external_node_url_namespaceObject = require("node:url");
const tray_dirname = external_node_path_default().dirname((0, external_node_url_namespaceObject.fileURLToPath)(__rslib_import_meta_url__));
let tray = null;
function setupTray(win) {
    const assetsDir = external_node_path_default().join(tray_dirname, '..', '..', 'src', 'assets');
    const iconPath = external_node_path_default().join(assetsDir, 'tray-iconTemplate.png');
    const icon2xPath = external_node_path_default().join(assetsDir, 'tray-iconTemplate@2x.png');
    const icon1x = external_electron_namespaceObject.nativeImage.createFromPath(iconPath);
    const icon2x = external_electron_namespaceObject.nativeImage.createFromPath(icon2xPath);
    const icon = external_electron_namespaceObject.nativeImage.createEmpty();
    icon.addRepresentation({
        scaleFactor: 1.0,
        buffer: icon1x.toPNG()
    });
    icon.addRepresentation({
        scaleFactor: 2.0,
        buffer: icon2x.toPNG()
    });
    icon.setTemplateImage(true);
    tray = new external_electron_namespaceObject.Tray(icon);
    tray.setToolTip('Google Meet');
    const contextMenu = external_electron_namespaceObject.Menu.buildFromTemplate([
        {
            label: 'Open Google Meet',
            click: ()=>showWindow(win)
        },
        {
            type: 'separator'
        },
        {
            label: 'About',
            click: ()=>external_electron_namespaceObject.app.showAboutPanel()
        },
        {
            label: 'Quit',
            accelerator: 'Cmd+Q',
            click: ()=>external_electron_namespaceObject.app.quit()
        }
    ]);
    tray.on('click', ()=>{
        if (win.isVisible()) {
            win.hide();
            external_electron_namespaceObject.app.dock?.hide();
        } else showWindow(win);
    });
    tray.on('right-click', ()=>{
        tray.popUpContextMenu(contextMenu);
    });
}
const TRAY_TITLE_MAX_CHARS = 12;
function updateTrayTitle(title, minsRemaining) {
    if (!tray) return;
    if (!title) return void tray.setTitle('');
    const truncated = title.length > TRAY_TITLE_MAX_CHARS ? title.slice(0, TRAY_TITLE_MAX_CHARS) + '\u2026' : title;
    if (void 0 !== minsRemaining && minsRemaining > 0) {
        const suffix = 1 === minsRemaining ? ' in 1 min' : ` in ${minsRemaining} mins`;
        tray.setTitle(truncated + suffix);
    } else tray.setTitle(truncated);
}
function showWindow(win) {
    const trayBounds = tray.getBounds();
    const position = getWindowPosition(win, trayBounds);
    win.setPosition(position.x, position.y, false);
    win.show();
    win.focus();
    external_electron_namespaceObject.app.dock?.hide();
}
function getWindowPosition(win, trayBounds) {
    const winBounds = win.getBounds();
    const display = external_electron_namespaceObject.screen.getDisplayNearestPoint({
        x: trayBounds.x,
        y: trayBounds.y
    });
    const workArea = display.workArea;
    let x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);
    let y = Math.round(trayBounds.y + trayBounds.height + 4);
    x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - winBounds.width));
    y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - winBounds.height));
    return {
        x,
        y
    };
}
const IPC_CHANNELS = {
    CALENDAR_GET_EVENTS: 'calendar:get-events',
    CALENDAR_REQUEST_PERMISSION: 'calendar:request-permission',
    CALENDAR_PERMISSION_STATUS: 'calendar:permission-status',
    WINDOW_SET_HEIGHT: 'window:set-height',
    APP_OPEN_EXTERNAL: 'app:open-external',
    APP_GET_VERSION: 'app:get-version'
};
const external_node_child_process_namespaceObject = require("node:child_process");
const external_node_util_namespaceObject = require("node:util");
const promises_namespaceObject = require("node:fs/promises");
const external_node_crypto_namespaceObject = require("node:crypto");
const external_node_fs_namespaceObject = require("node:fs");
const external_node_os_namespaceObject = require("node:os");
const execFileAsync = (0, external_node_util_namespaceObject.promisify)(external_node_child_process_namespaceObject.execFile);
const calendar_dirname = (0, external_node_path_namespaceObject.join)((0, external_node_url_namespaceObject.fileURLToPath)(__rslib_import_meta_url__), '..');
const SWIFT_SRC_DEV = (0, external_node_path_namespaceObject.join)(calendar_dirname, '..', '..', 'src', 'main', 'gimeet-events.swift');
const BINARY_DIR = (0, external_node_path_namespaceObject.join)((0, external_node_os_namespaceObject.tmpdir)(), 'gimeet');
const BINARY_PATH = (0, external_node_path_namespaceObject.join)(BINARY_DIR, 'gimeet-events');
const HASH_PATH = (0, external_node_path_namespaceObject.join)(BINARY_DIR, 'source.hash');
async function computeSwiftSourceHash(swiftSrc) {
    const content = await (0, promises_namespaceObject.readFile)(swiftSrc);
    return (0, external_node_crypto_namespaceObject.createHash)('sha256').update(content).digest('hex');
}
async function ensureBinary() {
    let swiftSrc = SWIFT_SRC_DEV;
    try {
        await (0, promises_namespaceObject.access)(swiftSrc, external_node_fs_namespaceObject.constants.R_OK);
    } catch  {
        swiftSrc = (0, external_node_path_namespaceObject.join)(process.resourcesPath, 'app', 'src', 'main', 'gimeet-events.swift');
    }
    await (0, promises_namespaceObject.mkdir)(BINARY_DIR, {
        recursive: true
    });
    const currentHash = await computeSwiftSourceHash(swiftSrc);
    try {
        await (0, promises_namespaceObject.access)(BINARY_PATH, external_node_fs_namespaceObject.constants.X_OK);
        const storedHash = await (0, promises_namespaceObject.readFile)(HASH_PATH, 'utf-8').catch(()=>'');
        if (storedHash.trim() === currentHash) return;
        console.log('[calendar] Swift source changed — recompiling binary');
        await (0, promises_namespaceObject.unlink)(BINARY_PATH).catch(()=>{});
    } catch  {}
    try {
        await execFileAsync('swiftc', [
            swiftSrc,
            '-o',
            BINARY_PATH
        ], {
            timeout: 60000
        });
    } catch  {
        await execFileAsync('swiftc', [
            swiftSrc,
            '-o',
            BINARY_PATH,
            '-sdk',
            '/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk'
        ], {
            timeout: 60000
        });
    }
    await (0, promises_namespaceObject.writeFile)(HASH_PATH, currentHash, 'utf-8');
}
async function runSwiftHelper() {
    await ensureBinary();
    const { stdout } = await execFileAsync(BINARY_PATH, [], {
        timeout: 15000
    });
    return stdout.trim();
}
function parseEvents(raw) {
    if (!raw) return [];
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const searchEnd = new Date(todayMidnight);
    searchEnd.setDate(searchEnd.getDate() + 2);
    const seen = new Set();
    return raw.split('\n').map((line)=>line.trim()).filter(Boolean).flatMap((line)=>{
        const parts = line.split('\t');
        if (parts.length < 7) return [];
        const [id, title, startStr, endStr, urlField, calendarName, allDayStr, emailField] = parts;
        const meetUrl = urlField.trim() || void 0;
        const startDate = new Date(startStr);
        const endDate = new Date(endStr);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return [];
        if (startDate < todayMidnight || startDate >= searchEnd) return [];
        const uid = id.trim();
        if (seen.has(uid)) return [];
        seen.add(uid);
        return [
            {
                id: uid,
                title: title.trim(),
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                ...meetUrl ? {
                    meetUrl
                } : {},
                calendarName: calendarName.trim(),
                isAllDay: 'true' === allDayStr.trim(),
                ...emailField?.trim() ? {
                    userEmail: emailField.trim()
                } : {}
            }
        ];
    }).sort((a, b)=>new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}
async function getCalendarEventsResult() {
    try {
        const output = await runSwiftHelper();
        return {
            events: parseEvents(output)
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[calendar] getCalendarEventsResult error:', err);
        return {
            error: message
        };
    }
}
async function runAppleScript(script) {
    const { stdout } = await execFileAsync("osascript", [
        '-e',
        script
    ], {
        timeout: 10000
    });
    return stdout.trim();
}
async function requestCalendarPermission() {
    try {
        await runAppleScript(`
      tell application "Calendar"
        get name of calendars
      end tell
    `);
        return 'granted';
    } catch  {
        return 'denied';
    }
}
async function getCalendarPermissionStatus() {
    try {
        await runAppleScript(`
      tell application "Calendar"
        get name of first calendar
      end tell
    `);
        return 'granted';
    } catch (err) {
        const msg = String(err);
        if (msg.includes('not authorized') || msg.includes('1743')) return 'denied';
        msg.includes('2700') || msg.includes('not determined');
        return 'not-determined';
    }
}
const ALLOWED_ORIGINS = new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173'
]);
function validateSender(event) {
    const senderUrl = event.senderFrame?.url ?? '';
    if (senderUrl.startsWith('file://')) return true;
    for (const origin of ALLOWED_ORIGINS)if (senderUrl.startsWith(origin)) return true;
    return false;
}
const MEET_URL_ALLOWLIST = [
    'https://meet.google.com/',
    'https://calendar.google.com/',
    'https://accounts.google.com/'
];
function isAllowedMeetUrl(url) {
    return MEET_URL_ALLOWLIST.some((prefix)=>url.startsWith(prefix));
}
function registerIpcHandlers(win) {
    external_electron_namespaceObject.ipcMain.handle(IPC_CHANNELS.CALENDAR_GET_EVENTS, async (event)=>{
        if (!validateSender(event)) return {
            error: 'unauthorized'
        };
        return getCalendarEventsResult();
    });
    external_electron_namespaceObject.ipcMain.handle(IPC_CHANNELS.CALENDAR_REQUEST_PERMISSION, async (event)=>{
        if (!validateSender(event)) return 'denied';
        return requestCalendarPermission();
    });
    external_electron_namespaceObject.ipcMain.handle(IPC_CHANNELS.CALENDAR_PERMISSION_STATUS, async (event)=>{
        if (!validateSender(event)) return 'denied';
        return getCalendarPermissionStatus();
    });
    external_electron_namespaceObject.ipcMain.on(IPC_CHANNELS.WINDOW_SET_HEIGHT, (_event, height)=>{
        if ('number' == typeof height && height > 0) win.setSize(360, Math.round(height), true);
    });
    external_electron_namespaceObject.ipcMain.handle(IPC_CHANNELS.APP_OPEN_EXTERNAL, async (event, url)=>{
        if (!validateSender(event)) return;
        if ('string' == typeof url && isAllowedMeetUrl(url)) await external_electron_namespaceObject.shell.openExternal(url);
    });
    external_electron_namespaceObject.ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, (event)=>{
        if (!validateSender(event)) return '';
        return external_electron_namespaceObject.app.getVersion();
    });
}
const OPEN_BEFORE_MS = 60000;
const TITLE_BEFORE_MS = 1800000;
const POLL_INTERVAL_MS = 120000;
const MAX_SCHEDULE_AHEAD_MS = 86400000;
const timers = new Map();
const titleTimers = new Map();
const countdownIntervals = new Map();
const clearTimers = new Map();
const scheduledStartMs = new Map();
const firedEvents = new Set();
let pollInterval = null;
function buildMeetUrl(event) {
    const base = (event.meetUrl ?? "").startsWith("https://") ? event.meetUrl : `https://${event.meetUrl}`;
    const email = event.userEmail?.trim();
    if (email && email.includes("@")) return `${base}?authuser=${encodeURIComponent(email)}`;
    return base;
}
function scheduleEvents(events) {
    const now = Date.now();
    const activeIds = new Set();
    for (const event of events){
        if (event.isAllDay) continue;
        const startMs = new Date(event.startDate).getTime();
        const openAtMs = startMs - OPEN_BEFORE_MS;
        const delayMs = openAtMs - now;
        if (startMs <= now) continue;
        if (delayMs > MAX_SCHEDULE_AHEAD_MS) continue;
        activeIds.add(event.id);
        if (firedEvents.has(event.id)) continue;
        if (timers.has(event.id)) {
            const prevStartMs = scheduledStartMs.get(event.id);
            if (prevStartMs === startMs) continue;
            clearTimeout(timers.get(event.id));
            timers.delete(event.id);
            scheduledStartMs.delete(event.id);
            firedEvents.delete(event.id);
            console.log(`[scheduler] Rescheduled "${event.title}" — start time changed`);
        }
        const effectiveDelay = Math.max(0, delayMs);
        const handle = setTimeout(()=>{
            timers.delete(event.id);
            scheduledStartMs.delete(event.id);
            firedEvents.add(event.id);
            if (!event.meetUrl) return;
            new external_electron_namespaceObject.Notification({
                title: "Meeting Starting",
                body: event.title
            }).show();
            const url = buildMeetUrl(event);
            external_electron_namespaceObject.shell.openExternal(url).catch((err)=>{
                console.error(`[scheduler] Failed to open ${url}:`, err);
            });
            console.log(`[scheduler] Opened browser for "${event.title}" → ${url}`);
        }, effectiveDelay);
        timers.set(event.id, handle);
        scheduledStartMs.set(event.id, startMs);
        console.log(`[scheduler] Scheduled "${event.title}" to open in ${Math.round(effectiveDelay / 1000)}s`);
        if (titleTimers.has(event.id)) {
            clearTimeout(titleTimers.get(event.id));
            titleTimers.delete(event.id);
        }
        if (countdownIntervals.has(event.id)) {
            clearInterval(countdownIntervals.get(event.id));
            countdownIntervals.delete(event.id);
        }
        if (clearTimers.has(event.id)) {
            clearTimeout(clearTimers.get(event.id));
            clearTimers.delete(event.id);
        }
        function tickCountdown() {
            const remaining = Math.ceil((startMs - Date.now()) / 60000);
            if (remaining > 0) updateTrayTitle(event.title, remaining);
        }
        function startCountdown() {
            tickCountdown();
            const intervalHandle = setInterval(()=>{
                tickCountdown();
            }, 60000);
            countdownIntervals.set(event.id, intervalHandle);
            console.log(`[scheduler] Countdown started for "${event.title}"`);
            const clearHandle = setTimeout(()=>{
                clearInterval(countdownIntervals.get(event.id));
                countdownIntervals.delete(event.id);
                clearTimers.delete(event.id);
                updateTrayTitle(null);
                console.log(`[scheduler] Tray title cleared (meeting started: "${event.title}")`);
            }, Math.max(0, startMs - Date.now()));
            clearTimers.set(event.id, clearHandle);
        }
        const titleAtMs = startMs - TITLE_BEFORE_MS;
        const titleDelayMs = titleAtMs - now;
        if (titleDelayMs > 0) {
            const titleHandle = setTimeout(()=>{
                titleTimers.delete(event.id);
                startCountdown();
            }, titleDelayMs);
            titleTimers.set(event.id, titleHandle);
            console.log(`[scheduler] Title timer set for "${event.title}" in ${Math.round(titleDelayMs / 1000)}s`);
        } else if (startMs > now) startCountdown();
    }
    for (const [id, handle] of timers)if (!activeIds.has(id)) {
        clearTimeout(handle);
        timers.delete(id);
        console.log(`[scheduler] Cancelled timer for removed event ${id}`);
    }
    for (const [id, handle] of titleTimers)if (!activeIds.has(id)) {
        clearTimeout(handle);
        titleTimers.delete(id);
    }
    for (const [id, handle] of countdownIntervals)if (!activeIds.has(id)) {
        clearInterval(handle);
        countdownIntervals.delete(id);
    }
    for (const [id, handle] of clearTimers)if (!activeIds.has(id)) {
        clearTimeout(handle);
        clearTimers.delete(id);
    }
    for (const id of firedEvents)if (!activeIds.has(id)) firedEvents.delete(id);
}
async function poll() {
    try {
        const result = await getCalendarEventsResult();
        if ("events" in result) scheduleEvents(result.events);
        else console.error("[scheduler] Calendar error:", result.error);
    } catch (err) {
        console.error("[scheduler] Poll error:", err);
    }
}
function startScheduler() {
    if (pollInterval) return;
    poll();
    pollInterval = setInterval(()=>void poll(), POLL_INTERVAL_MS);
    console.log("[scheduler] Started");
}
function stopScheduler() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
    for (const handle of timers.values())clearTimeout(handle);
    timers.clear();
    scheduledStartMs.clear();
    firedEvents.clear();
    for (const handle of titleTimers.values())clearTimeout(handle);
    titleTimers.clear();
    for (const handle of countdownIntervals.values())clearInterval(handle);
    countdownIntervals.clear();
    for (const handle of clearTimers.values())clearTimeout(handle);
    clearTimers.clear();
    updateTrayTitle(null);
    console.log("[scheduler] Stopped");
}
const main_dirname = external_node_path_default().dirname((0, external_node_url_namespaceObject.fileURLToPath)(__rslib_import_meta_url__));
const isDev = !external_electron_namespaceObject.app.isPackaged;
external_electron_namespaceObject.app.setAboutPanelOptions({
    applicationName: 'Google Meet',
    applicationVersion: external_electron_namespaceObject.app.getVersion(),
    version: external_electron_namespaceObject.app.getVersion(),
    credits: 'Developed by CCWorkforce Engineers',
    copyright: `© ${new Date().getFullYear()} CCWorkforce`,
    iconPath: external_node_path_default().join(main_dirname, '..', '..', 'assets', 'google-meet-icon.png')
});
let mainWindow = null;
function createWindow() {
    const win = new external_electron_namespaceObject.BrowserWindow({
        width: 360,
        height: 480,
        show: false,
        frame: false,
        resizable: false,
        movable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        vibrancy: "popover",
        visualEffectState: "active",
        titleBarStyle: "hidden",
        transparent: true,
        hasShadow: true,
        webPreferences: {
            preload: external_node_path_default().join(main_dirname, "..", "preload", "index.cjs"),
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    if (isDev) {
        const devUrl = process.env["VITE_DEV_SERVER_URL"] ?? "http://localhost:5173";
        win.loadURL(devUrl);
    } else win.loadFile(external_node_path_default().join(main_dirname, "..", "renderer", "index.html"));
    win.on("close", (event)=>{
        event.preventDefault();
        win.hide();
        external_electron_namespaceObject.app.dock?.hide();
    });
    win.on("minimize", ()=>{
        win.hide();
        external_electron_namespaceObject.app.dock?.hide();
    });
    win.on("blur", ()=>{
        if (!isDev) {
            win.hide();
            external_electron_namespaceObject.app.dock?.hide();
        }
    });
    return win;
}
external_electron_namespaceObject.app.whenReady().then(()=>{
    external_electron_namespaceObject.app.dock?.hide();
    mainWindow = createWindow();
    registerIpcHandlers(mainWindow);
    setupTray(mainWindow);
    startScheduler();
});
external_electron_namespaceObject.app.on("window-all-closed", ()=>{});
external_electron_namespaceObject.app.on("before-quit", ()=>{
    stopScheduler();
    if (mainWindow) mainWindow.destroy();
});
for(var __rspack_i in __webpack_exports__)exports[__rspack_i] = __webpack_exports__[__rspack_i];
Object.defineProperty(exports, '__esModule', {
    value: true
});
