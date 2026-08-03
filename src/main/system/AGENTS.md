# System — OS Integration Adapters

Leaf modules wrapping Electron/OS platform APIs. Mostly one OS surface per file. Lifecycle/orchestration stays in `app/lifecycle.ts`.

## FILES

| File | Role |
| --- | --- |
| `power.ts` | Battery-aware `getPollInterval()` (`BASE_POLL_INTERVAL_MS` 2min AC / 4min battery), ref-counted sleep prevention, `initPowerEvents` / `isOnBattery`, `powerMonitor` events |
| `display-horizon.ts` | Single wall-clock timer: `setDisplayHorizonEvents` / `clearDisplayHorizon` / `onDisplayHorizonTick`; lifecycle wires ticks to free-function `republishUiForDisplayTick` + tray force rebuild (no automation) |
| `auto-launch.ts` | Login items: `getAutoLaunchStatus` / `setAutoLaunch` / `syncAutoLaunch` via `app.setLoginItemSettings()` |
| `auto-updater.ts` | `initAutoUpdater()` + `isPortableInstall()`; no-op when unpackaged or portable |
| `notification.ts` | `checkNotificationPermission` probe + `getNotificationSettingsDeepLink` (`x-apple…` / `ms-settings:…`) |
| `shortcuts.ts` | `registerShortcuts(graph)` — CmdOrCtrl+Shift+M joins next meeting via `pickJoinTarget` + `graph.join.byId` |

## CONVENTIONS

- Prefer leaf modules with narrow dependencies.
- Each `init*` / `register*` is called from lifecycle (or settings IPC for auto-launch sync).
- OS branching via `platform/os.ts`.
- Shortcuts take `AppGraph` (not free-function calendar/scheduler imports).

## ANTI-PATTERNS

- Never import scheduler internals (`index`, `state`, `poll`) — facade or graph only.
- Never call `allowSleep()` without a matching prior `preventSleep()`.
- Never request notification permission here; `notification.ts` is probe-only.
- Never run auto-updater outside packaged **non-portable** builds.
- Never call raw `shell.openExternal` for meetings from shortcuts — use `graph.join.byId`.
- Do not hard-code macOS-only settings URIs in `notification.ts`; use `getNotificationSettingsDeepLink()`.
