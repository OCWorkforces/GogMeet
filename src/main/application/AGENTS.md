# application/

## OVERVIEW

Application layer: **ports** (interfaces) and **use cases**. No Electron, Node I/O, or Swift. Lint bans Electron and Node FS here.

## STRUCTURE

```text
application/
├── ports/
│   ├── calendar-port.ts          # getEvents(signal), permission, optional watch/OAuth hooks
│   ├── settings-store-port.ts    # load / get / update / save
│   ├── meeting-opener-port.ts    # open(url) → Result
│   ├── scheduler-port.ts         # cancelPendingBrowserOpen, getLastKnownEvents, forcePoll
│   ├── clock-port.ts             # now()
│   └── event-publisher-port.ts   # publish calendar UI updates
└── use-cases/
    ├── join-meeting.ts
    ├── get-meetings.ts
    ├── request-calendar-access.ts
    ├── get-calendar-permission-status.ts
    ├── disconnect-calendar.ts
    ├── load-settings.ts
    ├── get-settings.ts
    └── update-settings.ts
```

## Calendar use cases

| Use case | Notes |
| --- | --- |
| `get-meetings.ts` | Calls `calendar.getEvents(signal)`. Maps live complete → ready/empty; **partial → `limited`**; offline-cache → `offline-cached` + `cacheAgeMs`; offline never grants permission from ok alone |
| `join-meeting.ts` | Explicit join from lastKnown or fetch; any `isCalendarOk` variant with events is joinable |

## RULES

- Ports are TypeScript interfaces only (no Electron).
- Use cases depend on ports + `src/domain`, not concrete adapters.
- `CalendarPort.getEvents` **requires** `AbortSignal` (coordinator/poll budget later; callers may pass a fresh controller for now).
- Free-function facades in `src/main/facades/` and `utils/join-meeting.ts` are one-line delegates with module-level default bind.
- Production defaults are production-safe without lifecycle bind; `composition/bind-composition.ts` formalizes rebind for tests/graph.
- Unit tests: `tests/application/` (no Electron mocks) — get-meetings, join-meeting, disconnect-calendar.
