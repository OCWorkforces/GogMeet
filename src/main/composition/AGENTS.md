# composition/

## OVERVIEW

Composition root for the main process.

| File | Role |
| --- | --- |
| `app-graph.ts` | `AppGraph` types + `createAppGraph()` — production wiring of calendar, settings, join, opener, scheduler, watcher |
| `create-test-app-graph.ts` | `createTestAppGraph(overrides)` — partial graph for tests without rebinding facades |
| `bind-composition.ts` | Rebinds free-function use-case defaults (`rebind*Defaults`) |

## AppGraph surfaces

| Surface | Typical methods |
| --- | --- |
| `calendar` | getEvents, requestPermission, getPermissionStatus, disconnect, getUiState, warmup, invalidatePermissionCache, shouldAutoRequestPermission, reportPollError |
| `settings` | load, get, update, save |
| `join` | `byId(id)` |
| `opener` | `MeetingOpenerPort.open` |
| `scheduler` | forcePoll, start/stop/restart, setWindow, setTrayTitleCallback, initPowerCallbacks, getLastKnownEvents, cancelPendingBrowserOpen |
| `watcher` | start, stop, revive |

## RULES

- Pure wiring only: no network/OAuth/eager FS writes beyond lazy factories.
- Call `createAppGraph()` once at the start of `initializeApp` (before IPC).
- Prefer passing `AppGraph` into IPC / tray / shortcuts; free functions remain for internal adapters.
- Tests: `tests/helpers/app-graph.ts` → `testAppGraph()`; or `createTestAppGraph` with overrides + `skipBind` as needed.
