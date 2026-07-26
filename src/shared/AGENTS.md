# Shared — Cross-Process Contracts

Pure TypeScript contracts and utilities shared by main, preload, and renderer. This layer must not import Electron, Node process APIs, DOM globals, or project-specific runtime singletons.

## Files

| File | Role |
| --- | --- |
| `ipc-channels.ts` | `IPC_CHANNELS`, `IpcChannelMap`, `PushChannelMap`, `IpcRequest`, `IpcResponse`. |
| `meeting-event.ts` | `MeetingEvent` with branded IDs, dates, and optional meeting URL. |
| `calendar-result.ts` | `CalendarResult` (`kind: "ok" | "err"`), `isCalendarOk()`, permission type. |
| `brand.ts` | `EventId`, `MeetUrl`, `IsoUtc`, `WindowHeight` and validators. |
| `errors.ts` | `AppError` taxonomy, helpers, and type guards. |
| `event-signature.ts` | Stable event/list signatures for scheduler push and renderer rerender gating. |
| `result.ts` | Generic `Result<T,E>` and `AppResult<T>`. |
| `settings.ts` | `AppSettings`, defaults, min/max constants. |
| `alert.ts` | Narrow `AlertPayload` for full-screen alert display. |
| `app-state.ts` | Renderer app-state type extracted for tests and contracts. |
| `parse-json.ts` | JSON object parser + validator bridge returning `AppResult<T>`. |
| `utils/escape-html.ts` | XSS escaping for HTML string renderers. |
| `utils/time.ts` | Shared date/time formatting helpers. |

## IPC contracts

- `IPC_CHANNELS` is the single source of channel names; keep it `as const`.
- Invoke channels map to `{ request, response }` in `IpcChannelMap`.
- Push channels (`SETTINGS_CHANGED`, `CALENDAR_EVENTS_UPDATED`, `ALERT_SHOW`) map payloads in `PushChannelMap` and are main → renderer only.
- Fire-and-forget channels (`ALERT_DISMISSED`, `SCHEDULER_FORCE_POLL`, `WINDOW_SET_HEIGHT`) still have typed request payloads.
- Add a channel by updating shared channel maps first, then main handler, preload API, renderer caller, and tests.

## Model shapes

`MeetingEvent` fields: `id: EventId`, `title`, `startDate: IsoUtc`, `endDate: IsoUtc`, optional `meetUrl: MeetUrl`, `calendarName`, `isAllDay`, optional `userEmail`, optional `description`.

`CalendarResult` intentionally differs from generic `Result`: use `kind: "ok" | "err"`, not `ok: boolean`. Narrow with `isCalendarOk()` or `result.kind === "ok"`; never use `'error' in result`.

`AlertPayload` is a display-only projection: `id`, `title`, `startDate`, `endDate`, `calendarName`, `isAllDay`, optional `description`. It intentionally omits `meetUrl`; the alert renderer must not gain URL-opening capability.

`AppSettings`: `schemaVersion`, `openBeforeMinutes` (1–5), `launchAtLogin`, `showTomorrowMeetings`, `windowAlert`. Defaults live in `DEFAULT_SETTINGS`.

## Brands

Branded types are runtime strings/numbers with compile-time protection:

- `EventId` — non-empty trimmed string.
- `MeetUrl` — structurally valid HTTPS URL, no credentials, default port. Host allowlists live in main/preload egress checks.
- `IsoUtc` — finite date, with bare timestamps normalized as UTC.
- `WindowHeight` — rounded/clamped number in `[220, 480]`.

Validators return `Result<T,string>` and are used at Swift parser ingress, preload boundary, URL validation, and tests. Do not assign raw primitives to branded fields.

## Error/result rules

- Generic `Result<T,E>` uses `ok: true | false`.
- `AppResult<T>` is `Result<T, AppError>`.
- `AppError.kind` variants: `calendar-permission-denied`, `calendar-no-calendars`, `calendar-runtime`, `calendar-auth`, `calendar-network`, `validation`, `io`, `unknown`.
- Prefer `isCalendarPermissionDenied` / `isCalendarRuntime` (etc.) over ad-hoc kind checks.
- `errFrom()` wraps unknown thrown values; `formatAppError()` creates user-facing text.
- `isObjectRecord` lives in `type-guards.ts` (not under `main/swift/`).
- `parseJsonObject(raw, field, validate)` parses JSON, requires a plain object, then delegates validation. Parse/shape failures return `validation` errors.

## Rules

- No barrel files; import concrete shared modules.
- No `satisfies`, `enum`, or `namespace`.
- Keep shared modules side-effect-free and safe for all three processes.
- User-facing strings rendered into HTML must pass through `escapeHtml()`.
