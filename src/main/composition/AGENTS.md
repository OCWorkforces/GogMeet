# composition/

## Overview

This directory is the main-process composition root. It builds a production `AppGraph` and rebinds module-level facade defaults so lifecycle, IPC, tray, and shortcuts share the same surfaces.

| File                       | Role                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `app-graph.ts`             | `AppGraph` types and `createAppGraph()`, which wires calendar, settings, join, opener, scheduler, and watcher surfaces. |
| `create-test-app-graph.ts` | `createTestAppGraph(overrides)`, a partial graph helper that defaults `skipBind` to `true`.                             |
| `bind-composition.ts`      | Rebinds meeting opener, calendar, settings, and join facade defaults.                                                   |

## Calendar graph contract

- `graph.calendar.getEvents()` returns `CalendarPublication`, the coordinated envelope `{ publicationGeneration, result }`. It has no caller-provided signal because the refresh coordinator owns the provider call and its cancellation.
- `graph.calendar.getEventsResult()` returns only the enclosed `CalendarResult` for callers that need data rather than publication metadata, such as explicit join paths.
- `CalendarResult` describes the fetch outcome. `CalendarPublication` identifies a result produced by the coordinator and is used for refresh consumers and IPC pushes. Do not collapse the two contracts.
- The graph exposes UI snapshot reads, permission flow, disconnect, warmup, permission-cache invalidation, auto-request eligibility, and poll-level error reporting through its calendar surface.
- `graph.scheduler.forcePoll(options?)` returns a coordinated publication or `null`. `reason: "user"` bypasses the 10-second coalesce. `graph.scheduler` does not own display-horizon republish; lifecycle imports `republishUiForDisplayTick()` from `scheduler/facade.ts`.

## Construction and probe use

- `createAppGraph()` is pure dependency wiring apart from facade default binding and lazy adapter creation. It does not initiate a calendar request, OAuth flow, or eager settings write.
- Normal lifecycle calls it once before IPC. Pass the resulting graph to tray, IPC handlers, and shortcuts rather than rebuilding surfaces at each boundary.
- The tray packaged probe also creates the production graph so it exercises production tray setup and callbacks, but supplies synthetic events and calendar UI snapshots through the main bus.
- Probe mode is selected and preflighted by `app/`, not composition. The calendar factory rejects invalid packaged-probe preflight before selecting any real provider.

## Rules

- Keep this directory to wiring. Network, OAuth, EventKit, Swift, calendar transport, and persistence implementation belong to their actual adapter directories.
- Options are `skipBind` for tests with mocked facade defaults and `opener` for a meeting-opener override.
- Production graphs bind a **single** `MeetingOpenerPort` via `bindMeetingOpener` and rebind join defaults so IPC, join hub, and auto-open share egress. `skipBind` test graphs skip that rebind unless an explicit `opener` is passed.
- Use `tests/helpers/app-graph.ts` or `createTestAppGraph()` for test graphs. The latter defaults to `skipBind: true` so it does not rebind mocked facades.
