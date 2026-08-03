# composition/

## OVERVIEW

Composition root for the main process.

| File | Role |
| --- | --- |
| `app-graph.ts` | `AppGraph` types + `createAppGraph()` — production wiring of calendar, settings, join, opener, scheduler, watcher |
| `create-test-app-graph.ts` | `createTestAppGraph(overrides)` — partial graph for tests; **defaults `skipBind: true`** so mocked facades are not rebound |
| `bind-composition.ts` | Rebinds free-function defaults for calendar + settings + join only (`rebind*Defaults`) |

## AppGraph surfaces

| Surface | Typical methods |
| --- | --- |
| `calendar` | `getEvents` → `refreshCalendarPublication` (publication envelope; no signal on graph), `getEventsResult` → result-only refresh (join/shortcuts), requestPermission, getPermissionStatus, disconnect, getUiState, warmup, invalidatePermissionCache, shouldAutoRequestPermission, reportPollError |
| `settings` | load, get, update, save |
| `join` | `byId(id)` |
| `opener` | `MeetingOpenerPort.open` |
| `scheduler` | `forcePoll(options?: ForcePollOptions)` → publication or null (`reason: "user"` bypasses 10s coalesce), start, `stop({ preserveFiredState? })`, restart, setWindow, setTrayTitleCallback, initPowerCallbacks, getLastKnownEvents, cancelPendingBrowserOpen |
| `watcher` | start, stop, revive |

**Not on the graph (free-function / facade only):** `republishUiForDisplayTick` — lifecycle imports it from `scheduler/facade.js` for display-horizon ticks (display-only republish; no fetch).

## RULES

- Pure wiring only: no network/OAuth/eager FS writes beyond lazy factories.
- Call `createAppGraph()` once at the start of `initializeApp` (before IPC).
- Prefer passing `AppGraph` into IPC / tray / shortcuts; free functions remain for internal adapters and display-horizon republish.
- Options: `skipBind` (tests mocking facades; production omits it so defaults bind), `opener` override.
- Tests: `tests/helpers/app-graph.ts` → `testAppGraph()`; or `createTestAppGraph` (already `skipBind: true` by default) with surface overrides.
