# composition/

## OVERVIEW

Composition root for the main process.

| File | Role |
| --- | --- |
| `app-graph.ts` | `createAppGraph()` — production wiring of calendar, settings, join, opener, scheduler, watcher |
| `create-test-app-graph.ts` | `createTestAppGraph()` — test overrides without rebinding facades |
| `bind-composition.ts` | Rebinds free-function use-case defaults |

## RULES

- Pure wiring only: no network/OAuth/eager FS writes beyond lazy factories.
- Call `createAppGraph()` once at the start of `initializeApp` (before IPC).
- Prefer passing `AppGraph` into IPC / shortcuts; free functions remain for internal adapters.
