# System — OS Integration Adapters

Leaf modules wrapping Electron/OS platform APIs. No business logic, no cross-subsystem orchestration. Each file owns one OS surface.

## FILES

| File | Role |
| --- | --- |
| `power.ts` | Power management: battery-aware `getPollInterval()` (2min AC / 4min battery), ref-counted sleep prevention (`preventSleep`/`allowSleep`), `powerMonitor` events |
| `auto-launch.ts` | Login items: `enableAutoLaunch(enable)` via `app.setLoginItemSettings()` |
| `auto-updater.ts` | `electron-updater` bootstrap + `isPortableInstall()` (K26). Wired from lifecycle; skips unpackaged and portable |
| `notification.ts` | Notification permission dialog + platform settings deep-link (`x-apple…` / `ms-settings:…`). `checkNotificationPermission()`, `getNotificationSettingsDeepLink()` |
| `shortcuts.ts` | Global shortcut CmdOrCtrl+Shift+M opens the next upcoming meeting via `openMeetingUrl()` (allowlist-validated egress). Imports `scheduler/facade.js` for `getLastKnownEvents`. `registerShortcuts()` |

## CONVENTIONS

- Leaf modules. Zero dependencies on other main subsystems (scheduler internals, tray, windows, domain)
- Each file exports an `init*` function called from `lifecycle.ts`. `cleanup*` pairs where lifecycle matters
- Imports allowed from `shared/`, `utils/`, and `platform/os` only. Scheduler access via `scheduler/facade.js`
- Prefer `platform/os.ts` helpers over raw `process.platform` when branching

## ANTI-PATTERNS

- Never import from `scheduler/index.js`, `scheduler/state.js`, or `scheduler/poll.js`. Facade only
- Never import from `windows/` or `domain/`
- Never call `allowSleep()` without a matching prior `preventSleep()`. Ref count must balance
- Never request notification permission here. `notification.ts` is probe-only, prompt lives at call site
- Never run auto-updater outside packaged **non-portable** builds (`app.isPackaged` and not `isPortableInstall()`)
- Never import renderer/preload code; communicate through lifecycle callbacks or the typed event bus.
- Never call `shell.openExternal()` directly from `shortcuts.ts`. Route every meeting URL through `openMeetingUrl()` so the URL allowlist gate is enforced before egress.
- Do not hard-code macOS-only settings URIs in `notification.ts`; use `getNotificationSettingsDeepLink()`.
| `auto-updater.ts` | `initAutoUpdater()` — **called from lifecycle**; no-op when unpackaged; GitHub Releases feed |
| `shortcuts.ts` | `Cmd+Shift+M` → `pickJoinTarget` + `joinMeetingById`; non-modal Notification feedback |
- `shortcuts.ts` may use `scheduler/facade.js` (`getLastKnownEvents`) and `domain/calendar.js` for live fetch fallback — keep join via `joinMeetingById`.
- Never open meetings with raw `shell.openExternal` — use `joinMeetingById` / `openMeetingUrl`.
