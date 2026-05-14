# System — macOS Integration Adapters

Leaf modules wrapping macOS and Electron platform APIs. No business logic, no cross-subsystem orchestration. Each file owns one OS surface.

## FILES

| File | Role |
| --- | --- |
| `power.ts` | Power management: battery-aware `getPollInterval()` (2min AC / 4min battery), ref-counted sleep prevention (`preventSleep`/`allowSleep`), `powerMonitor` events |
| `auto-launch.ts` | macOS login items: `enableAutoLaunch(enable)` via `app.setLoginItemSettings()` |
| `auto-updater.ts` | `electron-updater` bootstrap. `initAutoUpdater()`. No-op when `app.isPackaged` is false |
| `notification.ts` | macOS notification permission probe: `checkNotificationPermission()`. Read-only, does not request |
| `shortcuts.ts` | Global shortcut Cmd+Shift+M → join next meeting. `registerShortcuts()`. Imports scheduler facade for `getLastKnownEvents` |

## CONVENTIONS

- Leaf modules. Zero dependencies on other main subsystems (scheduler internals, tray, windows, domain)
- Each file exports an `init*` function called from `lifecycle.ts`. `cleanup*` pairs where lifecycle matters
- Imports allowed from `shared/` and `utils/` only. Scheduler access via `scheduler/facade.js`
- macOS-only. No cross-platform branches, gate at lifecycle layer

## ANTI-PATTERNS

- Never import from `scheduler/index.js`, `scheduler/state.js`, or `scheduler/poll.js`. Facade only
- Never import from `windows/` or `domain/`
- Never call `allowSleep()` without a matching prior `preventSleep()`. Ref count must balance
- Never request notification permission here. `notification.ts` is probe-only, prompt lives at call site
- Never run auto-updater outside packaged builds. Always gate on `app.isPackaged`
- Never import renderer/preload code; communicate through lifecycle callbacks or the typed event bus.
- Keep platform assumptions macOS-specific; do not add cross-platform fallbacks without a product decision.
